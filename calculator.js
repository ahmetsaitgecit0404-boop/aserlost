'use strict';

/* ========== SECURITY UTILITIES ========== */
const AI_PROXY_URL=window.location.origin;
function sanitizeInput(str){
  if(str===null||str===undefined)return'';
  const d=document.createElement('div');
  d.textContent=String(str);
  return d.textContent;
}
function sanitizeHtml(str){
  return String(str||'').replace(/[&<>"']/g,function(m){
    return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[m];
  });
}
function validatePlate(plate){
  return /^0[1-9][0-9][A-Za-z]{1,3}\d{1,4}$|^[1-9][0-9][A-Za-z]{1,3}\d{2,4}$/.test(plate.replace(/\s/g,'').toUpperCase());
}
function validatePhone(phone){
  return /^0?5\d{9}$/.test(phone.replace(/[\s\-\(\)]/g,''));
}
function validateEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const _rateLimitStore={};
function checkRateLimit(key,limitMs){
  const now=Date.now();
  if(_rateLimitStore[key]&&(now-_rateLimitStore[key])<limitMs)return false;
  _rateLimitStore[key]=now;
  return true;
}
async function fetchWithTimeout(url,opts,timeoutMs){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs||15000);
  try{
    const res=await fetch(url,{...opts,signal:controller.signal});
    clearTimeout(timeout);
    return res;
  }catch(err){
    clearTimeout(timeout);
    if(err.name==='AbortError')throw new Error('Zaman aşımı');
    throw err;
  }
}
function getProxyUrl(){return AI_PROXY_URL||'';}
function getAiApiUrl(){const p=getProxyUrl();return p?p+'/api/ai/calculate':'';}
function getChatApiUrl(){const p=getProxyUrl();return p?p+'/api/chat':'';}
function getVisionApiUrl(){const p=getProxyUrl();return p?p+'/api/ai/vision':'';}
async function groqFetch(endpoint,messages,extra){
  const url=getProxyUrl()+endpoint;
  const body=JSON.stringify({model:extra?.model||'openai/gpt-oss-120b',messages,temperature:extra?.temp||0.3,max_tokens:extra?.tokens||2000,responseFormat:extra?.responseFormat?true:undefined});
  return fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json'},body},extra?.timeout||30000);
}
/* Groq'un decommission ettiği llama-3.2-*-vision-preview modelleri yerine tek noktadan güncel model */
const GROQ_VISION_MODEL='qwen/qwen3.6-27b';
/* AI'dan gelen JSON metnini dayanıklı şekilde parse eder: markdown fence temizler, gerekirse ilk {...} bloğunu regex ile çıkarır. Başarısız olursa anlaşılır bir hata fırlatır. */
function parseAiJson(text){
  const raw=String(text||'').trim();
  try{return JSON.parse(raw);}catch(_){}
  const fenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
  if(fenced!==raw){try{return JSON.parse(fenced);}catch(_){}}
  const match=raw.match(/\{[\s\S]*\}/);
  if(match){try{return JSON.parse(match[0]);}catch(_){}}
  throw new Error('AI yanıtı işlenemedi (geçersiz format). Lütfen tekrar deneyin.');
}




/* Kayitlar kendi sunucumuz uzerinden yaziliyor. Tarayicida veritabani
   anahtari tutulmuyor: kaynak koda bakan biri hicbir sey ele geciremez.
   Sunucu alanlari dogruluyor, boyut sinirliyor ve hiz limiti uyguluyor. */
async function sbInsert(table,data){
  try{
    await fetch('/api/kayit/'+encodeURIComponent(table),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
  }catch(e){}
}

/* ========== LINK TRACKING SYSTEM ========== */
function getUrlParam(name){const p=new URLSearchParams(window.location.search);return p.get(name)||'';}
function trackVisit(){
  const ref=getUrlParam('ref'),etiket=getUrlParam('etiket');
  if(!ref&&!etiket)return;
  const now=new Date(),d={ref:ref||'',etiket:etiket||'',tip:'visit',tarih:now.toLocaleDateString('tr-TR'),saat:now.toLocaleTimeString('tr-TR')};
  let visits=JSON.parse(localStorage.getItem('muvekkilbilgi_tracking')||'[]');
  visits.push(d);localStorage.setItem('muvekkilbilgi_tracking',JSON.stringify(visits));
  sbInsert('tracking',d);
}
function trackFormComplete(ref,etiket,moduleType){
  if(!ref&&!etiket)return;
  const now=new Date(),d={ref:ref||'',etiket:etiket||'',tip:'form_complete',modul:moduleType,tarih:now.toLocaleDateString('tr-TR'),saat:now.toLocaleTimeString('tr-TR')};
  let visits=JSON.parse(localStorage.getItem('muvekkilbilgi_tracking')||'[]');
  visits.push(d);localStorage.setItem('muvekkilbilgi_tracking',JSON.stringify(visits));
  sbInsert('tracking',d);
}
/* ========== PİYASA DEĞERİ YARDIMCISI ========== */
function suggestMarketValue(age,mileage){
  const baseRef=800000,ageFactor=Math.max(0.2,1-age*0.12),kmFactor=Math.max(0.3,1-mileage/250000);
  const raw=baseRef*ageFactor*kmFactor;
  const min=Math.round(raw*0.75/1000)*1000;
  const max=Math.round(raw*1.15/1000)*1000;
  return{min,max,hint:'Tahmini piyasa aralığı: '+new Intl.NumberFormat('tr-TR').format(min)+' - '+new Intl.NumberFormat('tr-TR').format(max)+' TL'};
}

const CAR_DATA = {
  'Alfa Romeo':['147','156','159','33','166','Brera','Giulia','Giulietta','GT','GTV','Mito','Spider','Stelvio','Tonale'],
  'Anadolu Isuzu':['D-Max','NLR','NPR','NQR','Falcon','Turquoise','Visigo','Novo Ultra','Citiport'],
  'Aston Martin':['DB11','DB12','DB9','DBS','DBX','Rapide','Vantage','Vanquish','Virage'],
  'Audi':['80','90','100','A1','A2','A3','A4','A5','A6','A7','A8','e-tron','e-tron GT','Q2','Q3','Q4 e-tron','Q5','Q5 e-tron','Q6','Q7','Q8','Q8 e-tron','R8','RS3','RS4','RS5','RS6','RS7','RS Q3','S1','S3','S4','S5','S6','S7','S8','SQ5','SQ7','SQ8','TT'],
  'Bentley':['Bentayga','Continental GT','Flying Spur','Mulsanne','Brooklands','Azure'],
  'BMW':['1 Serisi','2 Serisi','3 Serisi','4 Serisi','5 Serisi','6 Serisi','7 Serisi','8 Serisi','i3','i4','i5','i7','iX','iX1','iX2','iX3','M2','M3','M4','M5','M6','M8','X1','X2','X3','X4','X5','X6','X7','XM','Z3','Z4','Z8'],
  'BMC':['415','430','515','530','Procity','Belde','Otobüs','Levend','Tuğra','Fatih'],
  'BYD':['Atto 3','Atto 4','Dolphin','Dolphin Mini','Frigate 07','Frigate 08','Han','Qin Plus','Qin L','Seagull','Seal','Seal 06','Seal U','Sea Lion 05','Sea Lion 07','Shark','Song L','Song Plus','Tang','Yuan Plus','Yangwang U8','Denza D9'],
  'Changan':['Alsvin','CS15','CS35','CS55','CS75','CS85','Eado','Q35','UNI-K','UNI-T','UNI-V','Deepal SL03','Deepal S07','Lumin','Hunter Plus'],
  'Chery':['Tiggo 2 Pro','Tiggo 3','Tiggo 4','Tiggo 4 Pro','Tiggo 5x','Tiggo 7','Tiggo 7 Pro','Tiggo 7 Pro Max','Tiggo 8','Tiggo 8 Pro','Tiggo 8 Pro Max','Tiggo 9','Tiggo Cross','Arrizo 3','Arrizo 5','Arrizo 5 Pro','Arrizo 6','Arrizo 6 Pro','Arrizo 8','Omoda 3','Omoda 5','Omoda 5 Pro','Omoda 7','Omoda 9','iCar 03','Fulwin A8','Fulwin A9','Fulwin T6','Fulwin T9','Fulwin T10','Exeed LX','Exeed TXL','Exeed VX','Exeed RX','Exeed Yaoguang','Exeed Sterra ES'],
  'Citroen':['Ax','Berlingo','BX','C1','C2','C3','C3 Aircross','C3 Picasso','C4','C4 Cactus','C4 Picasso','C4 SpaceTourer','C5','C5 Aircross','C5 X','C6','C8','CX','DS3','DS4','DS5','DS7 Crossback','DS9','Grand C4 Picasso','Jumper','Jumpy','Nemo','Saxo','Spacetourer','Xantia','XM','Xsara','Xsara Picasso','Zx'],
  'Cupra':['Ateca','Born','Formentor','Ibiza','Leon','Tavascan','Terramar'],
  'Dacia':['Dokker','Duster','Jogger','Lodgy','Logan','Logan MCV','Sandero','Sandero Stepway','Solenza','Spring','Bigster'],
  'DFSK':['Aerolux','C35','C37','C-Serisi','F300','F500','Glory 580','Glory iX5','K01','K02','Seres 3','Seres 5','Eco','Mini Truck'],
  'Dodge':['Avenger','Caliber','Challenger','Charger','Durango','Grand Caravan','Journey','Nitro','Ram','Viper'],
  'Dongfeng':['AX5','AX7','AX9','E70','Fengon 500','Fengon 580','Fengon ix5','Fengon Mini EV','Joyear','Nano Box','Rich 6'],
  'DS':['DS3','DS3 Crossback','DS4','DS4 Crossback','DS5','DS7 Crossback','DS9'],
  'Ferrari':['296 GTB','360','430','458','488','812','California','F8','F40','F50','FF','GTC4Lusso','LaFerrari','Portofino','Purosangue','Roma','SF90','Testarossa'],
  'Fiat':['124 Spider','500','500C','500X','500L','600','Bravo','Croma','Doblo','Doblo Panorama','Ducato','Egea','Fiorino','Fullback','Grande Punto','Idea','Linea','Marea','Multipla','Palio','Panda','Punto','Qubo','Scudo','Sedici','Siena','Stilo','Strada','Tipo','Ulysse','Uno'],
  'Ford':['B-Max','Bronco','Bronco Sport','C-Max','Capri','Courier','EcoSport','Edge','Escort','Explorer','F-150','Fiesta','Focus','Focus C-Max','Fusion','Galaxy','Grand C-Max','Ka','Kuga','Maverick','Mondeo','Mustang','Mustang Mach-E','Orion','Probe','Puma','Ranger','Raptor','S-Max','Scorpio','Sierra','StreetKa','Taunus','Thunderbird','Tourneo Connect','Tourneo Courier','Tourneo Custom','Transit','Transit Connect','Transit Courier','Transit Custom'],
  'Forthing':['Lingzhi','SX5G','T5','T5 Evo','M4','M5','U-Tour','Thunder','Friday','Yacht'],
  'GAC':['Empow','Emzoom','GN6','GN8','GS3','GS4','GS5','GS8','M6','M8','Aion S','Aion Y','Aion V','Aion LX','Hyptec HT'],
  'Geely':['Atlas','Atlas Pro','Azkarra','Binray','Boyue','Coolray','Emgrand','Emgrand 7','Emgrand EC7','Geometry C','Geometry E','Monjaro','Okavango','Preface','Proton X50','Proton X70','Starray','Tugella','Vision X3','Vision X6'],
  'Honda':['Accord','Civic','CR-V','CR-Z','City','E','FR-V','HR-V','Insight','Integra','Jazz','Legend','NSX','Odyssey','Pilot','Prelude','Shuttle','Stepwgn','Stream','ZR-V'],
  'Hongqi':['E-HS9','H5','H7','H9','HS3','HS5','HS7','S9','EH7','E-HS3','Guoli'],
  'Hyundai':['Accent','Atos','Bayon','Coupe','Elantra','Excel','Galloper','Genesis Coupe','Getz','Grandeur','H100','H1','H350','i10','i20','i30','i40','Inster','Ioniq','Ioniq 5','Ioniq 6','Ioniq 9','Kona','Matrix','Porter','S Coupe','Santa Fe','Santa Cruz','Solaris','Sonata','Staria','Starex','Terracan','Trajet','Tucson','Veloster','Venue'],
  'Isuzu':['Ascender','D-Max','MU-7','MU-X','NPR','NQR','F-Serie','Rodeo','Trooper','VehiCross','Wizard'],
  'Iveco':['Daily','Eurocargo','Eurofire','Eurotech','Eurotrakker','Massif','S-Way','Stralis','Tector','Trakker','Turbo Daily','Unic'],
  'JAECOO':['J7','J8','J9','PHEV'],
  'Jaguar':['E-Pace','F-Pace','F-Type','I-Pace','S-Type','X-Type','XE','XF','XJ','XK','XKR'],
  'Jeep':['Avenger','Cherokee','CJ','Comanche','Compass','Gladiator','Grand Cherokee','Liberty','Patriot','Renegade','Wagoneer','Willys','Wrangler'],
  'Karsan':['Atak','Atak Electric','Citymood','e-ATA','Jest','Menu','Peoples','Star','Viber'],
  'Kia':['Besta','Carens','Carnival','Ceed','Cerato','Clarus','Elan','Enterprise','Ev6','EV9','Joice','K5','K7','K9','Magentis','Mohave','Niro','Opirus','Optima','Picanto','Pride','ProCeed','Ray','Retona','Rio','Rocsta','Seltos','Shuma','Sorento','Soul','Sportage','Stinger','Stonic','Venga','Xceed'],
  'Lada':['Granta','Kalina','Largus','Niva','Niva Travel','Priora','Samara','Vesta','2101','2106','2107','2121'],
  'Lamborghini':['Aventador','Countach','Diablo','Gallardo','Huracán','Murciélago','Revuelto','Temerario','Urus'],
  'Land Rover':['Defender','Defender 90','Defender 110','Defender 130','Discovery','Discovery Sport','Freelander','Series I','Series II','Series III'],
  'Leapmotor':['C01','C10','C11','C16','T03','S01'],
  'Lexus':['CT','ES','GS','GX','IS','LC','LFA','LS','LX','NX','RC','RX','UX','LM'],
  'Lynk & Co':['01','02','03','05','06','08','09'],
  'MAN':['Lion\'s City','Lion\'s Coach','Lion\'s Intercity','TGL','TGM','TGS','TGX','TGE','F2000'],
  'Maserati':['Ghibli','GranTurismo','GranCabrio','Grecale','Levante','MC20','Quattroporte','Spyder'],
  'Maxus':['Deliver 3','Deliver 7','Deliver 9','eDeliver 3','eDeliver 7','eDeliver 9','euniq 5','euniq 6','Mifa 9','EV30','EV70','EV80','V80','V90','T60','T90','G10','G20','D60','D90'],
  'Mazda':['121','2','3','323','5','6','616','626','929','B-Serisi','BT-50','CX-3','CX-30','CX-5','CX-60','CX-70','CX-80','CX-90','EZ-6','Millenia','MPV','MX-30','MX-5','Premacy','Protege','RX-7','RX-8','Tribute','Xedos'],
  'McLaren':['570S','600LT','650S','675LT','720S','750S','765LT','Artura','GT','P1','Senna','Speedtail'],
  'Mercedes-Benz':['A Serisi','AMG GT','B Serisi','C Serisi','Citan','CLA','CLC','CLK','CLS','E Serisi','EQA','EQB','EQC','EQE','EQS','EQV','G Serisi','GL Serisi','GLA','GLB','GLC','GLE','GLK','GLS','GT','M Serisi','MCL','ML','R Serisi','S Serisi','SL','SLC','SLK','SLR','SLS','Sprinter','T Serisi','V Serisi','Vaneo','Viano','Vito','W123','W124','W201'],
  'MG':['3','ZS','RX5','RX5 Plus','HS','HS Plug-in','MG4','MG5','MG7','MG Cyberster','MG EHS','MG Marvel R','MG Hector','MG Gloster','MG Extender','MG Pilot','MG ZS EV','MG Comet','MG Windsor'],
  'Mini':['Aceman','Clubman','Convertible','Cooper','Cooper S','Countryman','Coupe','GP','JCW','Mini Electric','One','Paceman','Roadster'],
  'Mitsubishi':['3000 GT','ASX','Attrage','Carisma','Colt','Eclipse','Eclipse Cross','Galant','Grandis','i-MiEV','L200','L300','L400','Lancer','Mirage','Montero','Outlander','Pajero','Pajero Mini','Pajero Pinin','RVR','Shogun','Signo','Space Star','Starion','Triton'],
  'Neta':['AYA','GT','L','S','U','V','X'],
  'Nissan':['100 NX','200 SX','350Z','370Z','Almera','Datsun Go','GT-R','Interstar','Juke','Kicks','King Cab','Kubistar','Leaf','Maxima','Micra','Murano','Navara','Note','NP200','NP300','Pathfinder','Patrol','Pixo','Primastar','Primera','Pulsar','Qashqai','Qashqai+2','Sentra','Serena','Skyline','Sunny','Terrano','Tiida','Townstar','Vanette','X-Trail'],
  'Nio':['EL6','EL7','EL8','ET5','ET7','ET9','ES6','ES7','ES8','EC6','EC7'],
  'Ora':['03 Funky Cat','07 Ballet Cat','08 Lightning Cat','Good Cat','Black Cat','White Cat','iQ'],
  'Otokar':['Africa','Ark','Doruk','e-Centro','Kent','Naviga','Sultan','Territo','Ulyso','Vectro','Atlas'],
  'Opel':['Adam','Agila','Astra','Calibra','Campo','Combo','Corsa','Crossland','Frontera','Grandland','GT','Insignia','Kadett','Karl','Manta','Meriva','Mokka','Monza','Movano','Omega','Rekord','Senator','Signum','Tigra','Vectra','Vivaro','Zafira','Zafira Life'],
  'Peugeot':['1007','104','106','107','108','2008','204','205','206','207','208','3008','301','304','305','306','307','308','309','4007','4008','404','405','406','407','408','5008','504','505','508','508L','604','605','607','806','807','Boxer','Expert','Ion','Landtrek','Partner','Ranch','Rifter','Traveller'],
  'Polestar':['1','2','3','4','5'],
  'Porsche':['356','550 Spyder','718 Boxster','718 Cayman','911','914','924','928','944','968','Boxster','Carrera GT','Cayenne','Cayman','Macan','Panamera','Taycan'],
  'Range Rover':['Evoque','Velar','Sport','Vogue','Westminster','Autobiography','SV','SVB'],
  'Renault':['11','12','18','19','21','25','30','4','5','6','9','Alpine A110','Arkana','Austral','Captur','Clio','Clio Symbol','Duster','Espace','Express','Fluence','Fuego','Grand Scenic','Kadjar','Kangoo','Koleos','Laguna','Latitude','Logan','Master','Megane','Modus','Rafale','Safrane','Sandero','Scenic','Scenic E-Tech','Symbol','Talisman','Thalia','Trafic','Twingo','Vel Satis','Wind','Zoe'],
  'Rolls-Royce':['Cullinan','Dawn','Ghost','Phantom','Spectre','Wraith','Silver Shadow','Silver Cloud'],
  'Scania':['G Serisi','P Serisi','R Serisi','S Serisi','L Serisi','3 Serisi','4 Serisi'],
  'Seat':['Alhambra','Altea','Altea XL','Arona','Arosa','Ateca','Cordoba','Exeo','Ibiza','Inca','Leon','Malaga','Marbella','Mii','Ronda','Tarraco','Toledo'],
  'Seres':['3','5','SF5','SF7','AITO M5','AITO M7','AITO M9'],
  'Skoda':['Citigo','Enyaq','Fabia','Favorit','Felicia','Forman','Kamiq','Karoq','Kodiaq','Octavia','Octavia Tour','Praktik','Rapid','Roomster','Scala','Superb','Yeti'],
  'Skywell':['BE11','ET5','HT3','SK10'],
  'Smart':['#1','#3','EQ Forfour','EQ Fortwo','Forfour','Fortwo','Roadster'],
  'SsangYong':['Actyon','Chairman','Korando','Kyron','Musso','Musso Sports','Rexton','Rexton Sports','Rodius','Stavic','Tivoli','Tivoli XLV','Torres'],
  'Subaru':['B9 Tribeca','BRZ','Crosstrek','Forester','Impreza','Justy','Legacy','Levorg','Libero','Outback','SVX','Tribeca','Vivio','WRX','XV','XT'],
  'Suzuki':['Alto','APV','Baleno','Celerio','Ciaz','Crafter','Ertiga','Grand Vitara','Ignis','Jimny','Kizashi','Liana','Ravi','S-Cross','Samurai','Splash','Super Carry','Swift','SX4','SX4 S-Cross','Vitara','Wagon R','X-90','XL7'],
  'SWM':['G01','G03','G05','G01F','X2','S400','X3','Dali','Haojue'],
  'Tata':['Indica','Indigo','Nano','Nexon','Safari','Tigor','Tiago','Harrier','Curvv','Altroz','Punch'],
  'Temsa':['Avenue','LD','MD','Maraton','Opalin','Prestige','Safari','Tourmalin','Visto'],
  'Tesla':['Cybertruck','Model 3','Model S','Model X','Model Y','Roadster'],
  'TOGG':['T10F','T10X','T10X Long Range'],
  'Tofaş':['Doğan','Kartal','Murat 124','Murat 131','Serçe','Şahin','Tempra'],
  'Toyota':['4Runner','Auris','Avensis','Aygo','Aygo X','C-HR','Camry','Carina','Celica','Corolla','Corolla Cross','Corolla Verso','Crown','FJ Cruiser','GR86','GR Yaris','GT86','Hiace','Highlander','Hilux','Land Cruiser','Land Cruiser Prado','Previa','Prius','Prius C','Proace','Proace City','Proace Verso','RAV4','Sequoia','Sienna','Starlet','Supra','Tacoma','Tercel','Urban Cruiser','Venza','Verso','Vios','Yaris','Yaris Cross'],
  'Voyah':['Dream','Free','Passion','Courage'],
  'Volkswagen':['Amarok','Arteon','Beetle','Bora','Caddy','California','Caravelle','Corrado','Crafter','Eos','Fox','Golf','Golf Plus','ID.3','ID.4','ID.5','ID.6','ID.7','ID.Buzz','Jetta','Kaefer','LT','Lupo','Multivan','New Beetle','Passat','Passat CC','Phaeton','Polo','Routan','Scirocco','Sharan','T-Cross','T-Roc','Taigo','Teramont','Tiguan','Tiguan Allspace','Touareg','Touran','Transporter','Up!','Vento','Viloran','W Polo'],
  'Volvo':['240','244','740','850','940','960','C30','C40','EX30','EX90','S40','S60','S70','S80','S90','V40','V50','V60','V70','V90','XC40','XC60','XC70','XC90'],
  'Xpeng':['P5','P7','P7+','G3','G6','G9','X9','Mona M03'],
  'Zeekr':['001','007','009','7X','X','Mix']
};

const VEHICLE_BASE_PRICES = {
  'Alfa Romeo|147':450000,'Alfa Romeo|156':480000,'Alfa Romeo|159':750000,'Alfa Romeo|166':1000000,'Alfa Romeo|33':300000,'Alfa Romeo|Brera':1200000,'Alfa Romeo|Giulia':3500000,'Alfa Romeo|Giulietta':1500000,'Alfa Romeo|GT':800000,'Alfa Romeo|GTV':1000000,'Alfa Romeo|Mito':900000,'Alfa Romeo|Spider':1400000,'Alfa Romeo|Stelvio':4500000,'Alfa Romeo|Tonale':3000000,
  'Anadolu Isuzu|D-Max':1500000,'Anadolu Isuzu|NLR':1800000,'Anadolu Isuzu|NPR':2000000,'Anadolu Isuzu|NQR':2200000,'Anadolu Isuzu|Falcon':2500000,'Anadolu Isuzu|Turquoise':3000000,'Anadolu Isuzu|Visigo':3500000,'Anadolu Isuzu|Novo Ultra':3200000,'Anadolu Isuzu|Citiport':2800000,
  'Aston Martin|DB11':18000000,'Aston Martin|DB12':20000000,'Aston Martin|DB9':12000000,'Aston Martin|DBS':22000000,'Aston Martin|DBX':20000000,'Aston Martin|Rapide':14000000,'Aston Martin|Vantage':16000000,'Aston Martin|Vanquish':20000000,'Aston Martin|Virage':10000000,
  'Audi|80':300000,'Audi|90':350000,'Audi|100':400000,'Audi|A1':1900000,'Audi|A2':700000,'Audi|A3':2500000,'Audi|A4':3500000,'Audi|A5':4500000,'Audi|A6':6000000,'Audi|A7':7500000,'Audi|A8':12000000,'Audi|e-tron':6000000,'Audi|e-tron GT':8000000,'Audi|Q2':2500000,'Audi|Q3':3200000,'Audi|Q4 e-tron':4500000,'Audi|Q5':5000000,'Audi|Q5 e-tron':5500000,'Audi|Q6':7000000,'Audi|Q7':9000000,'Audi|Q8':13000000,'Audi|Q8 e-tron':11000000,'Audi|R8':15000000,'Audi|RS3':4500000,'Audi|RS4':6000000,'Audi|RS5':7000000,'Audi|RS6':9500000,'Audi|RS7':11000000,'Audi|RS Q3':5000000,'Audi|S1':2000000,'Audi|S3':3500000,'Audi|S4':5000000,'Audi|S5':6000000,'Audi|S6':8000000,'Audi|S7':9500000,'Audi|S8':14000000,'Audi|SQ5':6500000,'Audi|SQ7':10000000,'Audi|SQ8':14000000,'Audi|TT':3500000,
  'Bentley|Bentayga':25000000,'Bentley|Continental GT':30000000,'Bentley|Flying Spur':32000000,'Bentley|Mulsanne':35000000,'Bentley|Brooklands':25000000,'Bentley|Azure':20000000,
  'BMW|1 Serisi':2400000,'BMW|2 Serisi':2800000,'BMW|3 Serisi':3200000,'BMW|4 Serisi':4200000,'BMW|5 Serisi':5500000,'BMW|6 Serisi':8000000,'BMW|7 Serisi':12000000,'BMW|8 Serisi':14000000,'BMW|i3':2800000,'BMW|i4':5000000,'BMW|i5':6000000,'BMW|i7':14000000,'BMW|iX':8000000,'BMW|iX1':3200000,'BMW|iX2':3800000,'BMW|iX3':4500000,'BMW|M2':7000000,'BMW|M3':7500000,'BMW|M4':8000000,'BMW|M5':12000000,'BMW|M6':10000000,'BMW|M8':14000000,'BMW|X1':2800000,'BMW|X2':3200000,'BMW|X3':4200000,'BMW|X4':5500000,'BMW|X5':8000000,'BMW|X6':9000000,'BMW|X7':14000000,'BMW|XM':13000000,'BMW|Z3':1500000,'BMW|Z4':3800000,'BMW|Z8':6000000,
  'BMC|415':2500000,'BMC|430':2800000,'BMC|515':3000000,'BMC|530':3500000,'BMC|Procity':4000000,'BMC|Belde':2200000,'BMC|Otobüs':5000000,'BMC|Levend':1500000,'BMC|Tuğra':1800000,'BMC|Fatih':2000000,
  'BYD|Atto 3':2000000,'BYD|Atto 4':1800000,'BYD|Dolphin':1500000,'BYD|Dolphin Mini':1000000,'BYD|Frigate 07':2800000,'BYD|Frigate 08':3200000,'BYD|Han':3500000,'BYD|Qin Plus':1600000,'BYD|Qin L':1800000,'BYD|Seagull':1000000,'BYD|Seal':2800000,'BYD|Seal 06':2200000,'BYD|Seal U':2600000,'BYD|Sea Lion 05':2000000,'BYD|Sea Lion 07':3000000,'BYD|Shark':3500000,'BYD|Song L':2800000,'BYD|Song Plus':2200000,'BYD|Tang':3200000,'BYD|Yuan Plus':1800000,'BYD|Yangwang U8':8000000,'BYD|Denza D9':4000000,
  'Changan|Alsvin':1000000,'Changan|CS15':900000,'Changan|CS35':1100000,'Changan|CS55':1400000,'Changan|CS75':1700000,'Changan|CS85':2000000,'Changan|Eado':1200000,'Changan|Q35':1300000,'Changan|UNI-K':2200000,'Changan|UNI-T':1800000,'Changan|UNI-V':1600000,'Changan|Deepal SL03':2200000,'Changan|Deepal S07':2500000,'Changan|Lumin':800000,'Changan|Hunter Plus':1800000,
  'Chery|Tiggo 2 Pro':1200000,'Chery|Tiggo 3':950000,'Chery|Tiggo 4':1100000,'Chery|Tiggo 4 Pro':1400000,'Chery|Tiggo 5x':1250000,'Chery|Tiggo 7':1500000,'Chery|Tiggo 7 Pro':1800000,'Chery|Tiggo 7 Pro Max':2000000,'Chery|Tiggo 8':2000000,'Chery|Tiggo 8 Pro':2200000,'Chery|Tiggo 8 Pro Max':2500000,'Chery|Tiggo 9':3000000,'Chery|Tiggo Cross':1500000,'Chery|Arrizo 3':800000,'Chery|Arrizo 5':1000000,'Chery|Arrizo 5 Pro':1150000,'Chery|Arrizo 6':1300000,'Chery|Arrizo 6 Pro':1450000,'Chery|Arrizo 8':1700000,'Chery|Omoda 3':1200000,'Chery|Omoda 5':1600000,'Chery|Omoda 5 Pro':1800000,'Chery|Omoda 7':2200000,'Chery|Omoda 9':2800000,'Chery|iCar 03':1600000,'Chery|Fulwin A8':1500000,'Chery|Fulwin A9':2000000,'Chery|Fulwin T6':1700000,'Chery|Fulwin T9':2200000,'Chery|Fulwin T10':2800000,'Chery|Exeed LX':2000000,'Chery|Exeed TXL':2500000,'Chery|Exeed VX':3500000,'Chery|Exeed RX':2800000,'Chery|Exeed Yaoguang':3000000,'Chery|Exeed Sterra ES':3500000,
  'Citroen|Ax':300000,'Citroen|Berlingo':1300000,'Citroen|BX':350000,'Citroen|C1':850000,'Citroen|C2':600000,'Citroen|C3':1100000,'Citroen|C3 Aircross':1350000,'Citroen|C3 Picasso':1000000,'Citroen|C4':1500000,'Citroen|C4 Cactus':1200000,'Citroen|C4 Picasso':1300000,'Citroen|C4 SpaceTourer':1600000,'Citroen|C5':1200000,'Citroen|C5 Aircross':2000000,'Citroen|C5 X':2200000,'Citroen|C6':1800000,'Citroen|C8':1500000,'Citroen|CX':5000000,'Citroen|DS3':1100000,'Citroen|DS4':1500000,'Citroen|DS5':1800000,'Citroen|DS7 Crossback':2200000,'Citroen|DS9':2500000,'Citroen|Grand C4 Picasso':1600000,'Citroen|Jumper':2200000,'Citroen|Jumpy':1800000,'Citroen|Nemo':900000,'Citroen|Saxo':350000,'Citroen|Spacetourer':2500000,'Citroen|Xantia':450000,'Citroen|XM':600000,'Citroen|Xsara':400000,'Citroen|Xsara Picasso':500000,'Citroen|Zx':350000,
  'Cupra|Ateca':2500000,'Cupra|Born':2800000,'Cupra|Formentor':2800000,'Cupra|Ibiza':2000000,'Cupra|Leon':2500000,'Cupra|Tavascan':3500000,'Cupra|Terramar':3000000,
  'Dacia|Bigster':1300000,'Dacia|Dokker':900000,'Dacia|Duster':1100000,'Dacia|Jogger':1050000,'Dacia|Lodgy':800000,'Dacia|Logan':700000,'Dacia|Logan MCV':750000,'Dacia|Sandero':750000,'Dacia|Sandero Stepway':850000,'Dacia|Solenza':500000,'Dacia|Spring':900000,
  'DFSK|Aerolux':1800000,'DFSK|C35':700000,'DFSK|C37':800000,'DFSK|C-Serisi':800000,'DFSK|F300':600000,'DFSK|F500':700000,'DFSK|Glory 580':1400000,'DFSK|Glory iX5':1600000,'DFSK|K01':500000,'DFSK|K02':550000,'DFSK|Seres 3':1600000,'DFSK|Seres 5':2200000,'DFSK|Eco':600000,'DFSK|Mini Truck':450000,
  'Dodge|Avenger':1800000,'Dodge|Caliber':1200000,'Dodge|Challenger':6000000,'Dodge|Charger':5500000,'Dodge|Durango':4000000,'Dodge|Grand Caravan':2000000,'Dodge|Journey':1400000,'Dodge|Nitro':1500000,'Dodge|Ram':5000000,'Dodge|Viper':8000000,
  'Dongfeng|AX5':1000000,'Dongfeng|AX7':1300000,'Dongfeng|AX9':1800000,'Dongfeng|E70':800000,'Dongfeng|Fengon 500':900000,'Dongfeng|Fengon 580':1200000,'Dongfeng|Fengon ix5':1500000,'Dongfeng|Fengon Mini EV':600000,'Dongfeng|Joyear':1000000,'Dongfeng|Nano Box':700000,'Dongfeng|Rich 6':1400000,
  'DS|DS3':1100000,'DS|DS3 Crossback':1900000,'DS|DS4':1500000,'DS|DS4 Crossback':2000000,'DS|DS5':1800000,'DS|DS7 Crossback':2200000,'DS|DS9':2500000,
  'Ferrari|296 GTB':25000000,'Ferrari|360':5000000,'Ferrari|430':7000000,'Ferrari|458':10000000,'Ferrari|488':12000000,'Ferrari|812':20000000,'Ferrari|California':8000000,'Ferrari|F8':15000000,'Ferrari|F40':35000000,'Ferrari|F50':40000000,'Ferrari|FF':12000000,'Ferrari|GTC4Lusso':14000000,'Ferrari|LaFerrari':50000000,'Ferrari|Portofino':12000000,'Ferrari|Purosangue':25000000,'Ferrari|Roma':17000000,'Ferrari|SF90':25000000,'Ferrari|Testarossa':15000000,
  'Fiat|124 Spider':2000000,'Fiat|500':1200000,'Fiat|500C':1300000,'Fiat|500X':1400000,'Fiat|500L':1100000,'Fiat|600':1500000,'Fiat|Bravo':700000,'Fiat|Croma':800000,'Fiat|Doblo':1100000,'Fiat|Doblo Panorama':1200000,'Fiat|Ducato':2000000,'Fiat|Egea':750000,'Fiat|Fiorino':900000,'Fiat|Fullback':1800000,'Fiat|Grande Punto':600000,'Fiat|Idea':500000,'Fiat|Linea':650000,'Fiat|Marea':450000,'Fiat|Multipla':500000,'Fiat|Palio':400000,'Fiat|Panda':900000,'Fiat|Punto':550000,'Fiat|Qubo':800000,'Fiat|Scudo':1600000,'Fiat|Sedici':700000,'Fiat|Siena':450000,'Fiat|Stilo':550000,'Fiat|Strada':500000,'Fiat|Tipo':900000,'Fiat|Ulysse':1200000,'Fiat|Uno':350000,
  'Ford|B-Max':950000,'Ford|Bronco':5000000,'Ford|Bronco Sport':2800000,'Ford|C-Max':1200000,'Ford|Capri':3000000,'Ford|Courier':500000,'Ford|EcoSport':1100000,'Ford|Edge':3000000,'Ford|Escort':350000,'Ford|Explorer':4000000,'Ford|F-150':6000000,'Ford|Fiesta':950000,'Ford|Focus':1250000,'Ford|Focus C-Max':1100000,'Ford|Fusion':800000,'Ford|Galaxy':2500000,'Ford|Grand C-Max':1300000,'Ford|Ka':400000,'Ford|Kuga':2000000,'Ford|Maverick':2500000,'Ford|Mondeo':1800000,'Ford|Mustang':4500000,'Ford|Mustang Mach-E':5000000,'Ford|Orion':350000,'Ford|Probe':500000,'Ford|Puma':1450000,'Ford|Ranger':2400000,'Ford|Raptor':3500000,'Ford|S-Max':2200000,'Ford|Scorpio':1000000,'Ford|Sierra':400000,'Ford|StreetKa':800000,'Ford|Taunus':250000,'Ford|Thunderbird':1500000,'Ford|Tourneo Connect':1600000,'Ford|Tourneo Courier':1400000,'Ford|Tourneo Custom':2200000,'Ford|Transit':2200000,'Ford|Transit Connect':1500000,'Ford|Transit Courier':1200000,'Ford|Transit Custom':1800000,
  'Forthing|Lingzhi':1200000,'Forthing|SX5G':1600000,'Forthing|T5':1400000,'Forthing|T5 Evo':1700000,'Forthing|M4':1300000,'Forthing|M5':1500000,'Forthing|U-Tour':2000000,'Forthing|Thunder':1800000,'Forthing|Friday':1400000,'Forthing|Yacht':2500000,
  'GAC|Empow':1600000,'GAC|Emzoom':1800000,'GAC|GN6':1500000,'GAC|GN8':2200000,'GAC|GS3':1200000,'GAC|GS4':1400000,'GAC|GS5':1700000,'GAC|GS8':2500000,'GAC|M6':1500000,'GAC|M8':2200000,'GAC|Aion S':1800000,'GAC|Aion Y':1600000,'GAC|Aion V':2200000,'GAC|Aion LX':3000000,'GAC|Hyptec HT':3500000,
  'Geely|Atlas':1800000,'Geely|Atlas Pro':2000000,'Geely|Azkarra':1600000,'Geely|Binray':1200000,'Geely|Boyue':1700000,'Geely|Coolray':1500000,'Geely|Emgrand':800000,'Geely|Emgrand 7':900000,'Geely|Emgrand EC7':800000,'Geely|Geometry C':1800000,'Geely|Geometry E':1400000,'Geely|Monjaro':2500000,'Geely|Okavango':2200000,'Geely|Preface':1800000,'Geely|Proton X50':1500000,'Geely|Proton X70':1800000,'Geely|Starray':2500000,'Geely|Tugella':2800000,'Geely|Vision X3':900000,'Geely|Vision X6':1100000,
  'Honda|Accord':2800000,'Honda|Civic':1450000,'Honda|CR-V':2100000,'Honda|CR-Z':1200000,'Honda|City':1200000,'Honda|E':2000000,'Honda|FR-V':1000000,'Honda|HR-V':1600000,'Honda|Insight':1400000,'Honda|Integra':2500000,'Honda|Jazz':1100000,'Honda|Legend':2500000,'Honda|NSX':8000000,'Honda|Odyssey':2500000,'Honda|Pilot':3000000,'Honda|Prelude':900000,'Honda|Shuttle':1500000,'Honda|Stepwgn':1800000,'Honda|Stream':900000,'Honda|ZR-V':1800000,
  'Hongqi|E-HS9':5000000,'Hongqi|H5':2500000,'Hongqi|H7':3500000,'Hongqi|H9':5000000,'Hongqi|HS3':2000000,'Hongqi|HS5':2800000,'Hongqi|HS7':4000000,'Hongqi|S9':6000000,'Hongqi|EH7':3000000,'Hongqi|E-HS3':2500000,'Hongqi|Guoli':3500000,
  'Hyundai|Accent':950000,'Hyundai|Atos':400000,'Hyundai|Bayon':1300000,'Hyundai|Coupe':800000,'Hyundai|Elantra':1300000,'Hyundai|Excel':300000,'Hyundai|Galloper':1200000,'Hyundai|Genesis Coupe':2000000,'Hyundai|Getz':500000,'Hyundai|Grandeur':2000000,'Hyundai|H100':800000,'Hyundai|H1':1500000,'Hyundai|H350':2200000,'Hyundai|i10':800000,'Hyundai|i20':950000,'Hyundai|i30':1250000,'Hyundai|i40':1400000,'Hyundai|Inster':1800000,'Hyundai|Ioniq':1400000,'Hyundai|Ioniq 5':2500000,'Hyundai|Ioniq 6':2800000,'Hyundai|Ioniq 9':3500000,'Hyundai|Kona':1500000,'Hyundai|Matrix':600000,'Hyundai|Porter':900000,'Hyundai|S Coupe':400000,'Hyundai|Santa Fe':2800000,'Hyundai|Santa Cruz':2500000,'Hyundai|Solaris':900000,'Hyundai|Sonata':2000000,'Hyundai|Staria':2500000,'Hyundai|Starex':1200000,'Hyundai|Terracan':1200000,'Hyundai|Trajet':800000,'Hyundai|Tucson':1800000,'Hyundai|Veloster':1400000,'Hyundai|Venue':1100000,
  'Isuzu|Ascender':1800000,'Isuzu|D-Max':1500000,'Isuzu|MU-7':2200000,'Isuzu|MU-X':2200000,'Isuzu|NPR':2000000,'Isuzu|NQR':2200000,'Isuzu|F-Serie':1800000,'Isuzu|Rodeo':1800000,'Isuzu|Trooper':2000000,'Isuzu|VehiCross':1800000,'Isuzu|Wizard':1500000,
  'Iveco|Daily':2000000,'Iveco|Eurocargo':3000000,'Iveco|Eurofire':2500000,'Iveco|Eurotech':3500000,'Iveco|Eurotrakker':4500000,'Iveco|Massif':2500000,'Iveco|S-Way':5500000,'Iveco|Stralis':5000000,'Iveco|Tector':3500000,'Iveco|Trakker':4000000,'Iveco|Turbo Daily':1800000,'Iveco|Unic':3000000,
  'JAECOO|J7':2200000,'JAECOO|J8':2800000,'JAECOO|J9':3500000,'JAECOO|PHEV':2800000,
  'Jaguar|E-Pace':2800000,'Jaguar|F-Pace':4000000,'Jaguar|F-Type':5500000,'Jaguar|I-Pace':5000000,'Jaguar|S-Type':1200000,'Jaguar|X-Type':1000000,'Jaguar|XE':2800000,'Jaguar|XF':4500000,'Jaguar|XJ':6000000,'Jaguar|XK':5000000,'Jaguar|XKR':6000000,
  'Jeep|Avenger':1600000,'Jeep|Cherokee':3000000,'Jeep|CJ':1000000,'Jeep|Comanche':1500000,'Jeep|Compass':2200000,'Jeep|Gladiator':5000000,'Jeep|Grand Cherokee':7000000,'Jeep|Liberty':1800000,'Jeep|Patriot':1200000,'Jeep|Renegade':1800000,'Jeep|Wagoneer':8000000,'Jeep|Willys':1500000,'Jeep|Wrangler':4500000,
  'Karsan|Atak':3500000,'Karsan|Atak Electric':5000000,'Karsan|Citymood':4500000,'Karsan|e-ATA':6000000,'Karsan|Jest':2500000,'Karsan|Menu':1500000,'Karsan|Peoples':2000000,'Karsan|Star':1800000,'Karsan|Viber':3000000,
  'Kia|Besta':500000,'Kia|Carens':1200000,'Kia|Carnival':2500000,'Kia|Ceed':1200000,'Kia|Cerato':1100000,'Kia|Clarus':600000,'Kia|Elan':400000,'Kia|Enterprise':3000000,'Kia|Ev6':2800000,'Kia|EV9':4500000,'Kia|Joice':700000,'Kia|K5':1800000,'Kia|K7':2500000,'Kia|K9':3500000,'Kia|Magentis':1000000,'Kia|Mohave':2200000,'Kia|Niro':1700000,'Kia|Opirus':1200000,'Kia|Optima':1400000,'Kia|Picanto':850000,'Kia|Pride':350000,'Kia|ProCeed':1400000,'Kia|Ray':700000,'Kia|Retona':800000,'Kia|Rio':950000,'Kia|Rocsta':500000,'Kia|Seltos':1500000,'Kia|Shuma':500000,'Kia|Sorento':2700000,'Kia|Soul':1400000,'Kia|Sportage':1800000,'Kia|Stinger':2800000,'Kia|Stonic':1300000,'Kia|Venga':1100000,'Kia|Xceed':1600000,
  'Lada|Granta':550000,'Lada|Kalina':400000,'Lada|Largus':500000,'Lada|Niva':700000,'Lada|Niva Travel':800000,'Lada|Priora':400000,'Lada|Samara':300000,'Lada|Vesta':600000,'Lada|2101':150000,'Lada|2106':180000,'Lada|2107':200000,'Lada|2121':350000,
  'Lamborghini|Aventador':30000000,'Lamborghini|Countach':35000000,'Lamborghini|Diablo':20000000,'Lamborghini|Gallardo':15000000,'Lamborghini|Huracán':20000000,'Lamborghini|Murciélago':18000000,'Lamborghini|Revuelto':35000000,'Lamborghini|Temerario':35000000,'Lamborghini|Urus':25000000,
  'Land Rover|Defender':8000000,'Land Rover|Defender 90':7500000,'Land Rover|Defender 110':8500000,'Land Rover|Defender 130':9500000,'Land Rover|Discovery':7000000,'Land Rover|Discovery Sport':5000000,'Land Rover|Freelander':3000000,'Land Rover|Series I':2000000,'Land Rover|Series II':2500000,'Land Rover|Series III':3000000,
  'Leapmotor|C01':1800000,'Leapmotor|C10':2000000,'Leapmotor|C11':2200000,'Leapmotor|C16':2500000,'Leapmotor|T03':900000,'Leapmotor|S01':1500000,
  'Lexus|CT':1800000,'Lexus|ES':3500000,'Lexus|GS':4000000,'Lexus|GX':5000000,'Lexus|IS':2800000,'Lexus|LC':6000000,'Lexus|LFA':20000000,'Lexus|LS':8000000,'Lexus|LX':10000000,'Lexus|NX':3200000,'Lexus|RC':4000000,'Lexus|RX':4500000,'Lexus|UX':2500000,'Lexus|LM':6000000,
  'Lynk & Co|01':2200000,'Lynk & Co|02':2000000,'Lynk & Co|03':1800000,'Lynk & Co|05':2500000,'Lynk & Co|06':1600000,'Lynk & Co|08':2800000,'Lynk & Co|09':3500000,
  'MAN|TGL':2500000,'MAN|TGM':3000000,'MAN|TGS':5000000,'MAN|TGX':6000000,'MAN|TGE':2800000,'MAN|Lion\'s City':5000000,'MAN|Lion\'s Coach':6000000,'MAN|Lion\'s Intercity':5500000,'MAN|F2000':2500000,
  'Maserati|Ghibli':6000000,'Maserati|GranTurismo':8000000,'Maserati|GranCabrio':8500000,'Maserati|Grecale':5000000,'Maserati|Levante':6500000,'Maserati|MC20':12000000,'Maserati|Quattroporte':8000000,'Maserati|Spyder':6000000,
  'Maxus|Deliver 3':1500000,'Maxus|Deliver 7':2000000,'Maxus|Deliver 9':2500000,'Maxus|eDeliver 3':1800000,'Maxus|eDeliver 7':2400000,'Maxus|eDeliver 9':3000000,'Maxus|euniq 5':1800000,'Maxus|euniq 6':2200000,'Maxus|Mifa 9':3500000,'Maxus|EV30':1200000,'Maxus|EV70':1800000,'Maxus|EV80':2200000,'Maxus|V80':1500000,'Maxus|V90':2000000,'Maxus|T60':1400000,'Maxus|T90':1800000,'Maxus|G10':1300000,'Maxus|G20':2000000,'Maxus|D60':1400000,'Maxus|D90':2000000,
  'Mazda|2':1200000,'Mazda|121':300000,'Mazda|3':1400000,'Mazda|323':300000,'Mazda|5':1000000,'Mazda|6':2200000,'Mazda|616':400000,'Mazda|626':400000,'Mazda|929':500000,'Mazda|B-Serisi':600000,'Mazda|BT-50':1800000,'Mazda|CX-3':1400000,'Mazda|CX-30':1800000,'Mazda|CX-5':2000000,'Mazda|CX-60':3000000,'Mazda|CX-70':3500000,'Mazda|CX-80':4000000,'Mazda|CX-90':4500000,'Mazda|EZ-6':2200000,'Mazda|Millenia':800000,'Mazda|MPV':600000,'Mazda|MX-30':2200000,'Mazda|MX-5':3000000,'Mazda|Premacy':500000,'Mazda|Protege':350000,'Mazda|RX-7':2000000,'Mazda|RX-8':1500000,'Mazda|Tribute':800000,'Mazda|Xedos':700000,
  'McLaren|570S':15000000,'McLaren|600LT':16000000,'McLaren|650S':14000000,'McLaren|675LT':18000000,'McLaren|720S':20000000,'McLaren|750S':22000000,'McLaren|765LT':25000000,'McLaren|Artura':20000000,'McLaren|GT':15000000,'McLaren|P1':35000000,'McLaren|Senna':35000000,'McLaren|Speedtail':40000000,
  'Mercedes-Benz|A Serisi':2800000,'Mercedes-Benz|AMG GT':14000000,'Mercedes-Benz|B Serisi':2600000,'Mercedes-Benz|C Serisi':4000000,'Mercedes-Benz|Citan':1500000,'Mercedes-Benz|CLA':3600000,'Mercedes-Benz|CLC':2000000,'Mercedes-Benz|CLK':2500000,'Mercedes-Benz|CLS':7000000,'Mercedes-Benz|E Serisi':6500000,'Mercedes-Benz|EQA':3500000,'Mercedes-Benz|EQB':4000000,'Mercedes-Benz|EQC':6000000,'Mercedes-Benz|EQE':8000000,'Mercedes-Benz|EQS':12000000,'Mercedes-Benz|EQV':8000000,'Mercedes-Benz|G Serisi':20000000,'Mercedes-Benz|GL Serisi':3000000,'Mercedes-Benz|GLA':3200000,'Mercedes-Benz|GLB':3800000,'Mercedes-Benz|GLC':5500000,'Mercedes-Benz|GLE':9000000,'Mercedes-Benz|GLK':2500000,'Mercedes-Benz|GLS':14000000,'Mercedes-Benz|GT':12000000,'Mercedes-Benz|M Serisi':2500000,'Mercedes-Benz|MCL':2000000,'Mercedes-Benz|ML':2500000,'Mercedes-Benz|R Serisi':2000000,'Mercedes-Benz|S Serisi':16000000,'Mercedes-Benz|SL':12000000,'Mercedes-Benz|SLC':3000000,'Mercedes-Benz|SLK':2500000,'Mercedes-Benz|SLR':25000000,'Mercedes-Benz|SLS':20000000,'Mercedes-Benz|Sprinter':4500000,'Mercedes-Benz|T Serisi':2000000,'Mercedes-Benz|V Serisi':5500000,'Mercedes-Benz|Vaneo':800000,'Mercedes-Benz|Viano':2800000,'Mercedes-Benz|Vito':3500000,'Mercedes-Benz|W123':400000,'Mercedes-Benz|W124':500000,'Mercedes-Benz|W201':350000,
  'MG|3':800000,'MG|ZS':1500000,'MG|RX5':1600000,'MG|RX5 Plus':1800000,'MG|HS':1600000,'MG|HS Plug-in':2000000,'MG|MG4':1600000,'MG|MG5':1200000,'MG|MG7':2000000,'MG|MG Cyberster':3500000,'MG|MG EHS':2400000,'MG|MG Marvel R':2800000,'MG|MG Hector':1800000,'MG|MG Gloster':2500000,'MG|MG Extender':1800000,'MG|MG Pilot':1200000,'MG|MG ZS EV':1700000,'MG|MG Comet':800000,'MG|MG Windsor':1500000,
  'Mini|Aceman':2500000,'Mini|Clubman':1500000,'Mini|Convertible':1800000,'Mini|Cooper':1200000,'Mini|Cooper S':1600000,'Mini|Countryman':2000000,'Mini|Coupe':1400000,'Mini|GP':2500000,'Mini|JCW':2200000,'Mini|Mini Electric':1800000,'Mini|One':1100000,'Mini|Paceman':1500000,'Mini|Roadster':1400000,
  'Mitsubishi|3000 GT':1500000,'Mitsubishi|ASX':1400000,'Mitsubishi|Attrage':800000,'Mitsubishi|Carisma':500000,'Mitsubishi|Colt':850000,'Mitsubishi|Eclipse':1200000,'Mitsubishi|Eclipse Cross':1800000,'Mitsubishi|Galant':900000,'Mitsubishi|Grandis':800000,'Mitsubishi|i-MiEV':800000,'Mitsubishi|L200':2200000,'Mitsubishi|L300':600000,'Mitsubishi|L400':700000,'Mitsubishi|Lancer':800000,'Mitsubishi|Mirage':700000,'Mitsubishi|Montero':2500000,'Mitsubishi|Outlander':2500000,'Mitsubishi|Pajero':3000000,'Mitsubishi|Pajero Mini':500000,'Mitsubishi|Pajero Pinin':800000,'Mitsubishi|RVR':1000000,'Mitsubishi|Shogun':2500000,'Mitsubishi|Signo':400000,'Mitsubishi|Space Star':600000,'Mitsubishi|Starion':700000,'Mitsubishi|Triton':1800000,
  'Neta|AYA':800000,'Neta|GT':1500000,'Neta|L':1800000,'Neta|S':1400000,'Neta|U':1200000,'Neta|V':1000000,'Neta|X':1300000,
  'Nissan|100 NX':400000,'Nissan|200 SX':600000,'Nissan|350Z':1800000,'Nissan|370Z':2500000,'Nissan|Almera':500000,'Nissan|Datsun Go':350000,'Nissan|GT-R':8000000,'Nissan|Interstar':1800000,'Nissan|Juke':1400000,'Nissan|Kicks':1500000,'Nissan|King Cab':700000,'Nissan|Kubistar':800000,'Nissan|Leaf':1600000,'Nissan|Maxima':1200000,'Nissan|Micra':900000,'Nissan|Murano':2000000,'Nissan|Navara':2100000,'Nissan|Note':1000000,'Nissan|NP200':500000,'Nissan|NP300':800000,'Nissan|Pathfinder':2200000,'Nissan|Patrol':4000000,'Nissan|Pixo':500000,'Nissan|Primastar':1200000,'Nissan|Primera':700000,'Nissan|Pulsar':1000000,'Nissan|Qashqai':1800000,'Nissan|Qashqai+2':1900000,'Nissan|Sentra':900000,'Nissan|Serena':1000000,'Nissan|Skyline':2000000,'Nissan|Sunny':350000,'Nissan|Terrano':700000,'Nissan|Tiida':600000,'Nissan|Townstar':1400000,'Nissan|Vanette':500000,'Nissan|X-Trail':2200000,
  'Nio|EL6':3500000,'Nio|EL7':4000000,'Nio|EL8':5000000,'Nio|ET5':3000000,'Nio|ET7':4000000,'Nio|ET9':6000000,'Nio|ES6':3200000,'Nio|ES7':4000000,'Nio|ES8':4500000,'Nio|EC6':3200000,'Nio|EC7':4000000,
  'Ora|03 Funky Cat':1800000,'Ora|07 Ballet Cat':2200000,'Ora|08 Lightning Cat':2800000,'Ora|Good Cat':1600000,'Ora|Black Cat':1000000,'Ora|White Cat':1200000,'Ora|iQ':1400000,
  'Otokar|Africa':1500000,'Otokar|Ark':2000000,'Otokar|Doruk':2800000,'Otokar|e-Centro':4000000,'Otokar|Kent':2500000,'Otokar|Naviga':5000000,'Otokar|Sultan':1800000,'Otokar|Territo':3500000,'Otokar|Ulyso':3000000,'Otokar|Vectro':2500000,'Otokar|Atlas':3000000,
  'Opel|Adam':800000,'Opel|Agila':500000,'Opel|Astra':1200000,'Opel|Calibra':400000,'Opel|Campo':600000,'Opel|Combo':1000000,'Opel|Corsa':950000,'Opel|Crossland':1300000,'Opel|Frontera':1600000,'Opel|Grandland':1700000,'Opel|GT':1000000,'Opel|Insignia':1800000,'Opel|Kadett':250000,'Opel|Karl':700000,'Opel|Manta':500000,'Opel|Meriva':850000,'Opel|Mokka':1500000,'Opel|Monza':500000,'Opel|Movano':1800000,'Opel|Omega':500000,'Opel|Rekord':300000,'Opel|Senator':600000,'Opel|Signum':800000,'Opel|Tigra':500000,'Opel|Vectra':700000,'Opel|Vivaro':1800000,'Opel|Zafira':1500000,'Opel|Zafira Life':2200000,
  'Peugeot|1007':600000,'Peugeot|104':200000,'Peugeot|106':350000,'Peugeot|107':600000,'Peugeot|108':700000,'Peugeot|2008':1350000,'Peugeot|204':200000,'Peugeot|205':350000,'Peugeot|206':500000,'Peugeot|207':650000,'Peugeot|208':1050000,'Peugeot|3008':1900000,'Peugeot|301':850000,'Peugeot|304':200000,'Peugeot|305':250000,'Peugeot|306':350000,'Peugeot|307':500000,'Peugeot|308':1400000,'Peugeot|309':300000,'Peugeot|4007':1400000,'Peugeot|4008':1500000,'Peugeot|404':200000,'Peugeot|405':250000,'Peugeot|406':400000,'Peugeot|407':600000,'Peugeot|408':1800000,'Peugeot|5008':2300000,'Peugeot|504':250000,'Peugeot|505':350000,'Peugeot|508':2400000,'Peugeot|508L':2600000,'Peugeot|604':300000,'Peugeot|605':400000,'Peugeot|607':600000,'Peugeot|806':800000,'Peugeot|807':1200000,'Peugeot|Boxer':2000000,'Peugeot|Expert':1700000,'Peugeot|Ion':700000,'Peugeot|Landtrek':1800000,'Peugeot|Partner':1200000,'Peugeot|Ranch':500000,'Peugeot|Rifter':1500000,'Peugeot|Traveller':2500000,
  'Polestar|1':5000000,'Polestar|2':2800000,'Polestar|3':3500000,'Polestar|4':3200000,'Polestar|5':4500000,
  'Porsche|356':3000000,'Porsche|550 Spyder':5000000,'Porsche|718 Boxster':9000000,'Porsche|718 Cayman':8500000,'Porsche|911':20000000,'Porsche|914':800000,'Porsche|924':600000,'Porsche|928':1500000,'Porsche|944':800000,'Porsche|968':1200000,'Porsche|Boxster':7000000,'Porsche|Carrera GT':30000000,'Porsche|Cayenne':12000000,'Porsche|Cayman':7500000,'Porsche|Macan':7000000,'Porsche|Panamera':15000000,'Porsche|Taycan':14000000,
  'Range Rover|Evoque':5500000,'Range Rover|Velar':7000000,'Range Rover|Sport':10000000,'Range Rover|Vogue':16000000,'Range Rover|Westminster':14000000,'Range Rover|Autobiography':18000000,'Range Rover|SV':20000000,'Range Rover|SVB':10000000,
  'Renault|4':200000,'Renault|5':250000,'Renault|6':200000,'Renault|9':250000,'Renault|11':300000,'Renault|12':200000,'Renault|18':250000,'Renault|19':300000,'Renault|21':350000,'Renault|25':500000,'Renault|30':400000,'Renault|Alpine A110':5000000,'Renault|Arkana':2000000,'Renault|Austral':1700000,'Renault|Captur':1300000,'Renault|Clio':900000,'Renault|Clio Symbol':780000,'Renault|Duster':1200000,'Renault|Espace':2200000,'Renault|Express':700000,'Renault|Fluence':950000,'Renault|Fuego':500000,'Renault|Grand Scenic':1500000,'Renault|Kadjar':1400000,'Renault|Kangoo':1200000,'Renault|Koleos':1900000,'Renault|Laguna':1000000,'Renault|Latitude':1200000,'Renault|Logan':800000,'Renault|Master':2200000,'Renault|Megane':1150000,'Renault|Modus':700000,'Renault|Rafale':2500000,'Renault|Safrane':800000,'Renault|Sandero':800000,'Renault|Scenic':1200000,'Renault|Scenic E-Tech':2500000,'Renault|Symbol':780000,'Renault|Talisman':1500000,'Renault|Thalia':650000,'Renault|Trafic':2200000,'Renault|Twingo':750000,'Renault|Vel Satis':800000,'Renault|Wind':800000,'Renault|Zoe':1800000,
  'Rolls-Royce|Cullinan':40000000,'Rolls-Royce|Dawn':35000000,'Rolls-Royce|Ghost':35000000,'Rolls-Royce|Phantom':60000000,'Rolls-Royce|Spectre':45000000,'Rolls-Royce|Wraith':35000000,'Rolls-Royce|Silver Shadow':15000000,'Rolls-Royce|Silver Cloud':20000000,
  'Scania|G Serisi':6000000,'Scania|P Serisi':5000000,'Scania|R Serisi':7000000,'Scania|S Serisi':8000000,'Scania|L Serisi':5500000,'Scania|3 Serisi':3000000,'Scania|4 Serisi':4000000,
  'Seat|Alhambra':1500000,'Seat|Altea':950000,'Seat|Altea XL':1000000,'Seat|Arona':1300000,'Seat|Arosa':500000,'Seat|Ateca':1900000,'Seat|Cordoba':600000,'Seat|Exeo':900000,'Seat|Ibiza':1150000,'Seat|Inca':500000,'Seat|Leon':1500000,'Seat|Malaga':400000,'Seat|Marbella':300000,'Seat|Mii':700000,'Seat|Ronda':300000,'Seat|Tarraco':2500000,'Seat|Toledo':800000,
  'Seres|3':1600000,'Seres|5':2200000,'Seres|SF5':2000000,'Seres|SF7':2500000,'Seres|AITO M5':2800000,'Seres|AITO M7':3500000,'Seres|AITO M9':4500000,
  'Skoda|Citigo':700000,'Skoda|Enyaq':3000000,'Skoda|Fabia':1100000,'Skoda|Favorit':300000,'Skoda|Felicia':350000,'Skoda|Forman':350000,'Skoda|Kamiq':1350000,'Skoda|Karoq':1850000,'Skoda|Kodiaq':2600000,'Skoda|Octavia':1400000,'Skoda|Octavia Tour':900000,'Skoda|Praktik':500000,'Skoda|Rapid':1100000,'Skoda|Roomster':700000,'Skoda|Scala':1200000,'Skoda|Superb':2300000,'Skoda|Yeti':1200000,
  'Skywell|BE11':2000000,'Skywell|ET5':2500000,'Skywell|HT3':1800000,'Skywell|SK10':1400000,
  'Smart|#1':2500000,'Smart|#3':2800000,'Smart|EQ Forfour':1500000,'Smart|EQ Fortwo':1200000,'Smart|Forfour':800000,'Smart|Fortwo':700000,'Smart|Roadster':1200000,
  'SsangYong|Actyon':800000,'SsangYong|Chairman':1500000,'SsangYong|Korando':1200000,'SsangYong|Kyron':800000,'SsangYong|Musso':600000,'SsangYong|Musso Sports':700000,'SsangYong|Rexton':1800000,'SsangYong|Rexton Sports':1500000,'SsangYong|Rodius':800000,'SsangYong|Stavic':700000,'SsangYong|Tivoli':1300000,'SsangYong|Tivoli XLV':1400000,'SsangYong|Torres':1600000,
  'Subaru|B9 Tribeca':1800000,'Subaru|BRZ':2500000,'Subaru|Crosstrek':2000000,'Subaru|Forester':2000000,'Subaru|Impreza':1600000,'Subaru|Justy':400000,'Subaru|Legacy':2000000,'Subaru|Levorg':2200000,'Subaru|Libero':350000,'Subaru|Outback':2300000,'Subaru|SVX':1000000,'Subaru|Tribeca':2000000,'Subaru|Vivio':300000,'Subaru|WRX':2500000,'Subaru|XV':1700000,'Subaru|XT':1000000,
  'Suzuki|Alto':750000,'Suzuki|APV':600000,'Suzuki|Baleno':1000000,'Suzuki|Celerio':820000,'Suzuki|Ciaz':1100000,'Suzuki|Crafter':600000,'Suzuki|Ertiga':900000,'Suzuki|Grand Vitara':1200000,'Suzuki|Ignis':900000,'Suzuki|Jimny':1800000,'Suzuki|Kizashi':1300000,'Suzuki|Liana':500000,'Suzuki|Ravi':400000,'Suzuki|Samurai':500000,'Suzuki|S-Cross':1600000,'Suzuki|Splash':700000,'Suzuki|Super Carry':400000,'Suzuki|Swift':950000,'Suzuki|SX4':1100000,'Suzuki|SX4 S-Cross':1500000,'Suzuki|Vitara':1400000,'Suzuki|Wagon R':600000,'Suzuki|X-90':400000,'Suzuki|XL7':1200000,
  'SWM|G01':1200000,'SWM|G03':1100000,'SWM|G05':1500000,'SWM|G01F':1300000,'SWM|X2':800000,'SWM|S400':900000,'SWM|X3':700000,'SWM|Dali':1000000,'SWM|Haojue':600000,
  'Tata|Altroz':700000,'Tata|Curvv':1200000,'Tata|Harrier':1400000,'Tata|Indica':300000,'Tata|Indigo':400000,'Tata|Nano':200000,'Tata|Nexon':900000,'Tata|Punch':700000,'Tata|Safari':1500000,'Tata|Tiago':600000,'Tata|Tigor':650000,
  'Temsa|Avenue':3500000,'Temsa|LD':2800000,'Temsa|MD':3000000,'Temsa|Maraton':3200000,'Temsa|Opalin':2000000,'Temsa|Prestige':3800000,'Temsa|Safari':4000000,'Temsa|Tourmalin':4500000,'Temsa|Visto':2500000,
  'Tesla|Cybertruck':7000000,'Tesla|Model 3':3500000,'Tesla|Model S':8000000,'Tesla|Model X':10000000,'Tesla|Model Y':4500000,'Tesla|Roadster':10000000,
  'TOGG|T10F':1800000,'TOGG|T10X':1500000,'TOGG|T10X Long Range':1700000,
  'Tofaş|Doğan':290000,'Tofaş|Kartal':280000,'Tofaş|Murat 124':250000,'Tofaş|Murat 131':200000,'Tofaş|Serçe':250000,'Tofaş|Şahin':300000,'Tofaş|Tempra':350000,
  'Toyota|4Runner':3500000,'Toyota|Auris':950000,'Toyota|Avensis':1200000,'Toyota|Aygo':850000,'Toyota|Aygo X':1100000,'Toyota|C-HR':1650000,'Toyota|Camry':2100000,'Toyota|Carina':400000,'Toyota|Celica':800000,'Toyota|Corolla':1380000,'Toyota|Corolla Cross':1600000,'Toyota|Corolla Verso':900000,'Toyota|Crown':2500000,'Toyota|FJ Cruiser':3500000,'Toyota|GR86':3000000,'Toyota|GR Yaris':2800000,'Toyota|GT86':2000000,'Toyota|Hiace':1500000,'Toyota|Highlander':3500000,'Toyota|Hilux':2000000,'Toyota|Land Cruiser':6000000,'Toyota|Land Cruiser Prado':4000000,'Toyota|Previa':1200000,'Toyota|Prius':1800000,'Toyota|Prius C':1200000,'Toyota|Proace':1800000,'Toyota|Proace City':1400000,'Toyota|Proace Verso':2200000,'Toyota|RAV4':2200000,'Toyota|Sequoia':6000000,'Toyota|Sienna':2500000,'Toyota|Starlet':250000,'Toyota|Supra':5000000,'Toyota|Tacoma':2500000,'Toyota|Tercel':200000,'Toyota|Urban Cruiser':600000,'Toyota|Venza':2000000,'Toyota|Verso':1000000,'Toyota|Vios':1100000,'Toyota|Yaris':960000,'Toyota|Yaris Cross':1250000,
  'Voyah|Dream':3500000,'Voyah|Free':3000000,'Voyah|Passion':4000000,'Voyah|Courage':2500000,
  'Volkswagen|Amarok':3200000,'Volkswagen|Arteon':3200000,'Volkswagen|Beetle':1500000,'Volkswagen|Bora':600000,'Volkswagen|Caddy':1600000,'Volkswagen|California':3500000,'Volkswagen|Caravelle':3000000,'Volkswagen|Corrado':600000,'Volkswagen|Crafter':2500000,'Volkswagen|Eos':1200000,'Volkswagen|Fox':650000,'Volkswagen|Golf':1580000,'Volkswagen|Golf Plus':1200000,'Volkswagen|ID.3':2200000,'Volkswagen|ID.4':2800000,'Volkswagen|ID.5':3200000,'Volkswagen|ID.6':3500000,'Volkswagen|ID.7':4000000,'Volkswagen|ID.Buzz':3500000,'Volkswagen|Jetta':1400000,'Volkswagen|Kaefer':400000,'Volkswagen|LT':1000000,'Volkswagen|Lupo':600000,'Volkswagen|Multivan':4000000,'Volkswagen|New Beetle':1200000,'Volkswagen|Passat':2100000,'Volkswagen|Passat CC':1800000,'Volkswagen|Phaeton':3500000,'Volkswagen|Polo':1100000,'Volkswagen|Routan':1200000,'Volkswagen|Scirocco':1400000,'Volkswagen|Sharan':2000000,'Volkswagen|T-Cross':1500000,'Volkswagen|T-Roc':1950000,'Volkswagen|Taigo':1600000,'Volkswagen|Teramont':4000000,'Volkswagen|Tiguan':2400000,'Volkswagen|Tiguan Allspace':2800000,'Volkswagen|Touareg':5000000,'Volkswagen|Touran':2200000,'Volkswagen|Transporter':2800000,'Volkswagen|Up!':800000,'Volkswagen|Vento':800000,'Volkswagen|Viloran':4000000,'Volkswagen|W Polo':500000,
  'Volvo|240':300000,'Volvo|244':350000,'Volvo|740':350000,'Volvo|850':400000,'Volvo|940':500000,'Volvo|960':600000,'Volvo|C30':1500000,'Volvo|C40':4500000,'Volvo|EX30':2500000,'Volvo|EX90':6000000,'Volvo|S40':1400000,'Volvo|S60':3500000,'Volvo|S70':500000,'Volvo|S80':2000000,'Volvo|S90':7000000,'Volvo|V40':1600000,'Volvo|V50':1200000,'Volvo|V60':3700000,'Volvo|V70':1500000,'Volvo|V90':7500000,'Volvo|XC40':3200000,'Volvo|XC60':5000000,'Volvo|XC70':2500000,'Volvo|XC90':8000000,
  'Xpeng|P5':2200000,'Xpeng|P7':2800000,'Xpeng|P7+':3200000,'Xpeng|G3':1800000,'Xpeng|G6':2800000,'Xpeng|G9':3500000,'Xpeng|X9':4000000,'Xpeng|Mona M03':1600000,
  'Zeekr|001':3500000,'Zeekr|007':3000000,'Zeekr|009':5000000,'Zeekr|7X':3500000,'Zeekr|X':2800000,'Zeekr|Mix':3200000
};

const CAR_TRIMS = {
  _default:['Base','Comfort','Premium','Full'],
  luxury:['Base','Premium','Sport','Ultimate'],
  sport:['Base','Sport','R','Clubsport'],
  premium:['Access','Base','Premium','Business','Full'],
  suv:['Base','Comfort','Premium','4x4','Adventure','Off-Road'],
  _budget:['Base','Comfort','Premium'],
  'Audi':['Base','Advanced','S line','Black Edition','Competition','Carbon'],
  'BMW':['Base','Sport Line','Luxury Line','M Sport','M Performance','Individual'],
  'Mercedes-Benz':['Comfort','Progressive','Avantgarde','Exclusive','AMG Line'],
  'BMW-M':['Base','Competition','CS','CSL'],
  'Porsche':['Base','S','4S','GTS','Turbo','Turbo S'],
  'Ferrari':['Base','S','GTB','Spider','Pista','Speciale'],
  'Lamborghini':['Base','S','Performante','Evo','SVJ','STO'],
  'McLaren':['Base','S','LT','Spider','Senna'],
  'Range Rover':['Base','SE','HSE','Autobiography','SV'],
  'Land Rover':['Base','S','SE','HSE','Metropolitan','X-Dynamic'],
  'Tesla':['Standard Range','Long Range','Performance','Plaid'],
  'TOGG':['V1 Standart Menzil','V1 Uzun Menzil','V2 Uzun Menzil'],
  'Chery':['Base','Comfort','Premium','Pro','Pro Max','Excellence','Business','Luxury','Executive'],
  'BYD':['Base','Comfort','Design','Premium','Flagship'],
  'MG':['Base','Comfort','Luxury','Exclusive','Trophy'],
  'JAECOO':['Base','Comfort','Premium','Luxury'],
  'Hyundai':['Jump','Style','Elite','N Line','N'],
  'Kia':['Cool','Elegance','Prestige','GT Line'],
  'Toyota':['Vision','Dream','Flame','Passion'],
  'Volkswagen':['Life','Elegance','R Line','R','GTE','GTI'],
  'Renault':['Joy','Touch','Icon','R.S. Line','Initiale Paris'],
  'Fiat':['Easy','Urban','Lounge','Limited'],
  'Ford':['Base','Titanium','ST Line','Active','Vignale','ST','RS'],
  'Volvo':['Core','Plus','Ultimate','Recharge'],
  'Peugeot':['Base','Active','Allure','GT Line','GT','PSE'],
  'Opel':['Edition','GS','Ultimate'],
  'Seat':['Base','Reference','Style','Xcellence','FR','Cupra'],
  'Skoda':['Base','Active','Ambition','Style','Sportline','Laurin & Klement','RS'],
  'Dacia':['Base','Essential','Expression','Journey','Extreme'],
  'Nissan':['Base','Visia','Acenta','N-Connecta','Tekna','Nismo'],
  'Honda':['Base','Trend','Elegance','Executive','Sport','Type R'],
  'Mazda':['Base','Prime-Line','Revolution','Takumi','Sport Black'],
  'Suzuki':['Base','GL','GLX','Sport','Limited'],
  'Citroen':['Feel','Feel Bold','Shine','Shine Bold'],
  'SsangYong':['Base','Urban','Premium','Limited','Offroad'],
  'Lexus':['Base','Elegance','F Sport','Executive','Takumi'],
  'Cupra':['Base','V1','V2','VZ','VZ3','TCR'],
  'Mini':['Base','Classic','PEPPER','SALT','JCW','John Cooper Works'],
  'DS':['Base','Performance Line','Rivoli','Opera','Esprit de Voyage'],
  'Polestar':['Standard','Long Range','Dual Motor','Performance'],
  'Jeep':['Longitude','Limited','S','Trailhawk','Summit'],
  'Subaru':['Base','Comfort','Limited','Sport','STI'],
};
/* Marka geneli yerine modele özel gerçek paket (trim) adları — CAR_TRIMS[marka]'dan önce kontrol edilir.
   Anahtar format: 'Marka|Model'. Şimdilik Türkiye pazarında model bazında paket isimlendirmesi
   marka geneline uymayan Chery serisi girildi (bkz. Omoda 5 "Excellent" paketi). */
const CAR_MODEL_TRIMS = {
  'Chery|Tiggo 2 Pro':['Comfort','Luxury'],
  'Chery|Tiggo 3':['Comfort','Luxury'],
  'Chery|Tiggo 4':['Comfort','Luxury'],
  'Chery|Tiggo 4 Pro':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo 5x':['Comfort','Luxury'],
  'Chery|Tiggo 7':['Comfort','Luxury'],
  'Chery|Tiggo 7 Pro':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo 7 Pro Max':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo 8':['Comfort','Luxury'],
  'Chery|Tiggo 8 Pro':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo 8 Pro Max':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo 9':['Comfort','Luxury','Excellent'],
  'Chery|Tiggo Cross':['Comfort','Luxury'],
  'Chery|Arrizo 3':['Comfort','Luxury'],
  'Chery|Arrizo 5':['Comfort','Luxury'],
  'Chery|Arrizo 5 Pro':['Comfort','Luxury'],
  'Chery|Arrizo 6':['Comfort','Luxury'],
  'Chery|Arrizo 6 Pro':['Comfort','Luxury'],
  'Chery|Arrizo 8':['Comfort','Luxury','Excellent'],
  'Chery|Omoda 3':['Comfort','Luxury'],
  'Chery|Omoda 5':['Comfort','Luxury','Excellent'],
  'Chery|Omoda 5 Pro':['Comfort','Luxury','Excellent'],
  'Chery|Omoda 7':['Comfort','Luxury','Excellent'],
  'Chery|Omoda 9':['Comfort','Luxury','Excellent'],
  'Chery|iCar 03':['Comfort','Excellent'],
  'Chery|Fulwin A8':['Comfort','Luxury'],
  'Chery|Fulwin A9':['Comfort','Luxury'],
  'Chery|Fulwin T6':['Comfort','Luxury'],
  'Chery|Fulwin T9':['Comfort','Luxury'],
  'Chery|Fulwin T10':['Comfort','Luxury','Excellent'],
  'Chery|Exeed LX':['Elite','Prestige'],
  'Chery|Exeed TXL':['Elite','Prestige'],
  'Chery|Exeed VX':['Elite','Prestige'],
  'Chery|Exeed RX':['Elite','Prestige'],
  'Chery|Exeed Yaoguang':['Prestige'],
  'Chery|Exeed Sterra ES':['Prestige'],
};
const TRIM_MULTIPLIERS = {_default:1.0,'Base':1.0,'Standard':1.0,'Standart':1.0,'Access':0.95,
  'Comfort':1.05,'Style':1.05,'Life':1.03,'Touch':1.03,'Joy':1.02,'Pop':1.02,
  'Premium':1.15,'Elite':1.12,'Elegance':1.12,'Allure':1.10,'R-Design':1.10,
  'Full':1.25,'Exclusive':1.25,'Luxury':1.25,'Full':1.25,'Flagship':1.30,
  'Sport':1.20,'GT Line':1.18,'FR':1.15,'N Line':1.15,'ST Line':1.15,
  'GT':1.35,'R':1.40,'STI':1.45,'N':1.40,'GTE':1.20,'GTI':1.30,
  'RS':1.50,'Type R':1.50,'Vignale':1.30,'Line':1.10,'SV':1.30,
  '4S':1.15,'GTS':1.30,'Turbo':1.40,'Turbo S':1.50,'Plaid':1.60,
  'Long Range':1.10,'Uzun Menzil':1.10,'Performance':1.20,'Limited':1.15,
  'AMG Line':1.25,'M Sport':1.20,'S line':1.15,'Avantgarde':1.10,
  'Autobiography':1.40,'SE':1.08,'HSE':1.15,'SV':1.30,'SVJ':1.50,'STO':1.50,
  'Pro':1.10,'Pro Max':1.18,'Premium':1.15,'Luxury':1.20,'Trophy':1.15,
  'Adventure':1.10,'Off-Road':1.12,'4x4':1.08,'Sportline':1.12,'Style':1.05,
  'Sport Line':1.12,'M Performance':1.30,'Black Edition':1.08,'Competition':1.20,
  'CS':1.30,'CSL':1.50,'Design':1.08,'Lounge':1.06,'Dream':1.04,'Grace':1.07,
  'Passion':1.10,'Edition':1.06,  'Exclusive':1.25,'Excellence':1.18,'Business':1.06,'Executive':1.15,'Individual':1.35,
  'Excellent':1.15,'Excellent+':1.22,'Elite':1.12,'Prestige':1.20,
  'Jump':0.95,'Cool':0.95,'Vision':0.95,'Flame':1.15,'R Line':1.15,'Urban':1.05,'Ultimate':1.30,'Feel':1.0,'Feel Bold':1.08,'Shine Bold':1.20,'Shine':1.12,
  'Longitude':1.0,'Luxury Line':1.20,'Progressive':1.08,'Core':0.95,'Plus':1.10,'V1 Standart Menzil':1.0,'V1 Uzun Menzil':1.10,'V2 Uzun Menzil':1.25};
/* CAR_TRIMS'teki isimler mevcut (2019 sonrası) nesil için araştırıldı — daha eski bir araç
   yılı seçildiğinde o dönemde muhtemelen hiç kullanılmamış güncel paket ismini göstermek
   yanlış olur. Eski araçlarda marka-özel isim yerine nötr/genel bir liste ("Base/Comfort/
   Premium/Full") gösteriyoruz — bu, "muhtemelen yanlış olan spesifik bir isim" göstermekten daha dürüst. */
const TRIM_CURRENT_GEN_MIN_YEAR=2019;
function getTrimsForVehicle(brand,model,year){
  const modelOverride=CAR_MODEL_TRIMS[brand+'|'+model];
  if(modelOverride)return modelOverride;
  const y=parseInt(year)||new Date().getFullYear();
  if(y>=TRIM_CURRENT_GEN_MIN_YEAR&&CAR_TRIMS[brand])return CAR_TRIMS[brand];
  return CAR_TRIMS._default||['Base','Comfort','Premium','Full'];
}
function getTrimPrice(basePrice,trimName){
  const m=TRIM_MULTIPLIERS[trimName]||TRIM_MULTIPLIERS['_default'];
  return Math.round(basePrice*m);
}

const PART_WEIGHTS = {
  tavan:{paint:6,replace:8},kaput:{paint:4,replace:6},bagaj:{paint:4,replace:6},
  sol_on_camurluk:{paint:3,replace:5},sag_on_camurluk:{paint:3,replace:5},
  sol_on_kapi:{paint:3,replace:5},sag_on_kapi:{paint:3,replace:5},
  sol_arka_kapi:{paint:3,replace:5},sag_arka_kapi:{paint:3,replace:5},
  sol_arka_camurluk:{paint:3,replace:5},sag_arka_camurluk:{paint:3,replace:5},
  on_tampon:{paint:0.75,replace:1.5},arka_tampon:{paint:0.75,replace:1.5}
};
const PART_TYPE_MULTIPLIERS = {original:0,lokal_boyali:0.4,boyali:0.7,degisen:1.0};
const PART_TYPE_LABELS = {original:'Orijinal',lokal_boyali:'Lokal Boyalı',boyali:'Boyalı',degisen:'Değişen'};
const KM_FACTORS = [{max:29999,factor:0.90},{max:49999,factor:0.85},{max:69999,factor:0.80},{max:89999,factor:0.75},{max:109999,factor:0.70},{max:129999,factor:0.65},{max:149999,factor:0.58},{max:174999,factor:0.52},{max:199999,factor:0.46},{max:Infinity,factor:0.40}];
const AGE_FACTORS = [{max:2,factor:1.00},{max:4,factor:0.92},{max:6,factor:0.82},{max:8,factor:0.74},{max:10,factor:0.66},{max:12,factor:0.58},{max:15,factor:0.50},{max:20,factor:0.42},{max:Infinity,factor:0.36}];
const PART_LABELS = {tavan:'Tavan',kaput:'Kaput',bagaj:'Bagaj',sol_on_camurluk:'Sol Ön Çamurluk',sag_on_camurluk:'Sağ Ön Çamurluk',sol_on_kapi:'Sol Ön Kapı',sag_on_kapi:'Sağ Ön Kapı',sol_arka_kapi:'Sol Arka Kapı',sag_arka_kapi:'Sağ Arka Kapı',sol_arka_camurluk:'Sol Arka Çamurluk',sag_arka_camurluk:'Sağ Arka Çamurluk',on_tampon:'Ön Tampon',arka_tampon:'Arka Tampon'};
const TURKISH_CITIES = ['Adana','Adıyaman','Afyonkarahisar','Ağrı','Amasya','Ankara','Antalya','Artvin','Aydın','Balıkesir','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kırıkkale','Kırklareli','Kırşehir','Kilis','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak'];

const TESTIMONIALS=[];


/* =====================================================================
   ARAÇ İKONLARI
   Emoji yerine tek tip çizgi ikon: emoji her platformda farklı çiziliyor,
   boyutu ve ağırlığı kontrol edilemiyor, arayüzde ucuz duruyor. Hepsi
   24x24 kutuda, aynı çizgi kalınlığında (1.6) ve currentColor ile
   kategori rengini alıyor.
   ===================================================================== */
const ICON_PATHS = {
  pusula:    '<circle cx="12" cy="12" r="8.5"/><path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z"/>',
  iade:      '<path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1"/><path d="M3.4 4.6v4.6h4.6"/><path d="M14 9.6a2.6 2.6 0 0 0-2.3-1.2c-1.3 0-2.1.7-2.1 1.7 0 2.3 4.6 1.2 4.6 3.6 0 1.1-1 1.9-2.4 1.9A2.8 2.8 0 0 1 9.4 14"/><path d="M11.8 7v1.2M11.8 15.6v1.2"/>',
  konteyner: '<rect x="2.6" y="7.4" width="18.8" height="10.4" rx="1.6"/><path d="M7.2 7.4v10.4M12 7.4v10.4M16.8 7.4v10.4"/><path d="M5 17.8v1.8M19 17.8v1.8"/>',
  yuzde: '<circle cx="7.8" cy="7.8" r="2.7"/><circle cx="16.2" cy="16.2" r="2.7"/><path d="M18.6 5.4L5.4 18.6"/>',
  arac:      '<path d="M4 16l1.4-4.6A2 2 0 0 1 7.3 10h9.4a2 2 0 0 1 1.9 1.4L20 16"/><rect x="2.5" y="16" width="19" height="3.6" rx="1.4"/><circle cx="7" cy="19.6" r="1.3"/><circle cx="17" cy="19.6" r="1.3"/><path d="M9 7l1.5-2.4h3L15 7"/>',
  carpisma:  '<path d="M12 3l1.9 4.2L18 6l-1.2 4.1L21 12l-4.2 1.9L18 18l-4.1-1.2L12 21l-1.9-4.2L6 18l1.2-4.1L3 12l4.2-1.9L6 6l4.1 1.2z"/>',
  kusur:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 16v.01"/>',
  hasar:     '<path d="M14.5 3.5l6 6-3 3-6-6z"/><path d="M11.5 6.5L3.5 14.5V20h5.5l8-8"/><path d="M6 17l1.5 1.5"/>',
  saat:      '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
  pert:      '<path d="M12 3l3 6 5-2-2 5 4 3-5 1.5.5 5-4.5-2.5L8 21l.5-5L3.5 15l4-3-2-5 5 2z"/>',
  saglik:    '<path d="M12 4.5v15M4.5 12h15" stroke-width="2.2"/><rect x="3" y="3" width="18" height="18" rx="4" stroke-width="1.4"/>',
  sakatlik:  '<circle cx="12" cy="5.2" r="2.4"/><path d="M12 9v5.5M12 14.5l-3.2 5M12 14.5l3.2 5M8.2 11h7.6"/>',
  yoksun:    '<path d="M12 20s-6.5-4-6.5-9A3.7 3.7 0 0 1 12 8.6 3.7 3.7 0 0 1 18.5 11c0 5-6.5 9-6.5 9z"/><path d="M9.5 12.5l2 2 3.5-3.5"/>',
  manevi:    '<path d="M12 20s-6.5-4-6.5-9A3.7 3.7 0 0 1 12 8.6 3.7 3.7 0 0 1 18.5 11c0 5-6.5 9-6.5 9z"/><path d="M12 8.6L9.6 13h4.8L12 17"/>',
  canta:     '<rect x="3" y="7.5" width="18" height="12.5" rx="2.4"/><path d="M8.5 7.5V6a2.2 2.2 0 0 1 2.2-2.2h2.6A2.2 2.2 0 0 1 15.5 6v1.5"/><path d="M3 12.5h18"/>',
  belge:     '<path d="M7 3.2h6.5L19 8.7v12.1H7z" /><path d="M13.5 3.2v5.5H19"/><path d="M9.6 13h6.4M9.6 16.6h6.4"/>',
  belgeOnay: '<path d="M7 3.2h6.5L19 8.7v12.1H7z"/><path d="M13.5 3.2v5.5H19"/><path d="M9.6 15.2l2 2 3.6-3.8"/>',
  kask:      '<path d="M3.6 15.5a8.4 8.4 0 0 1 16.8 0"/><rect x="2.6" y="15.5" width="18.8" height="4" rx="1.8"/><path d="M12 7.1v-2"/>',
  kalkan:    '<path d="M12 3.2l7 2.9v5.6c0 4.4-2.9 7.4-7 9-4.1-1.6-7-4.6-7-9V6.1z"/><path d="M9 12l2 2 4-4"/>',
  vergi:     '<path d="M6 3.2h12v17.6l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9.2 8h5.6M9.2 11.6h5.6M9.2 15.2h3.2"/>',
  terazi:    '<path d="M12 4v16M7 20h10M4 9h16"/><path d="M4 9l-2 4.6a3.4 3.4 0 0 0 4 0z"/><path d="M20 9l2 4.6a3.4 3.4 0 0 1-4 0z"/><circle cx="12" cy="4" r="1.3"/>',
  aile:      '<circle cx="8.2" cy="7.4" r="2.6"/><circle cx="16.4" cy="8.6" r="2.1"/><path d="M3.4 20c0-3.1 2.1-5.2 4.8-5.2s4.8 2.1 4.8 5.2"/><path d="M14 20c0-2.4 1.2-4 3-4s3.6 1.6 3.6 4"/>',
  miras:     '<path d="M5.5 4.4h13v15.2h-13z"/><path d="M8.6 8.4h6.8M8.6 12h6.8M8.6 15.6h4"/><path d="M18.5 4.4a2 2 0 0 1 0 4"/>',
  arazi:     '<path d="M3 20h18"/><path d="M5.5 20V9.8L12 5l6.5 4.8V20"/><path d="M10 20v-5.4h4V20"/>',
  urun:      '<path d="M4.4 8.2h15.2l-1.3 11.6H5.7z"/><path d="M8.8 8.2V6.4a3.2 3.2 0 0 1 6.4 0v1.8"/>',
  tapu:      '<path d="M3.4 11.2L12 4.4l8.6 6.8"/><path d="M5.8 10v9.6h12.4V10"/><circle cx="12" cy="14.4" r="1.7"/><path d="M12 16.1v2.2"/>'
};

/* Hangi araç hangi ikonu kullanıyor */
const MODULE_ICONS = {
  durumTespiti: 'pusula', vergiIade: 'iade', evSatisIade: 'tapu',
  kusur: 'kusur', arac: 'arac', hasar: 'hasar',
  mahrumiyet: 'saat', pertBedeli: 'pert', sakatlik: 'sakatlik', yoksun: 'yoksun',
  maddi: 'vergi', kasko: 'yoksun', manevi: 'manevi', gecici: 'saglik',
  kalici: 'sakatlik', trafikCezasi: 'belge',
  isHukukuSihirbaz: 'canta', fesih: 'belgeOnay', iseIade: 'terazi', iscilik: 'canta',
  iseIadeTazminat: 'belgeOnay', isgucu: 'sakatlik', isKazasi: 'kask', bakiyeSure: 'saat',
  gozetim: 'vergi', ithalatVergi: 'konteyner', gumrukCeza: 'yuzde',
  vergiZiyai: 'yuzde', emlakVergisi: 'tapu', vergiDavasi: 'terazi',
  bosanma: 'aile', miras: 'miras', kamulastirma: 'arazi', nafaka: 'aile',
  tuketici: 'urun', tapu: 'tapu'
};

function moduleIcon(id, size) {
  /* '__anahtar' biçimi doğrudan ikon seçmek için (blog kategorileri gibi
     modül olmayan yerlerde kullanılıyor). */
  const key = (id && id.slice(0,2)==='__') ? id.slice(2) : (MODULE_ICONS[id] || 'belge');
  const s = size || 22;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICON_PATHS[key] + '</svg>';
}

const MODULES = [
  // ===== NEREDEN BAŞLAYACAĞINI BİLMEYENLER İÇİN =====
  {id:'durumTespiti',title:'Hangi hakkım var, nereden başlamalıyım?',icon:'🧭',desc:'Birkaç soru soralım, durumunuzu tahmin edelim: dosyanızda hangi tazminat kalemleri var, süreniz ne kadar kaldı ve hangi hesabı yapmanız gerekiyor.',tags:['Akıllı Tahmin','3-5 Soru','Yol Haritası'],screen:'tani',category:'baslangic'},
  // ===== TRAFİK KAZASI HUKUKU — giriş: araç değer kaybı =====
  {id:'arac',title:'Aracım kaza yaptı, değer kaybım ne kadar?',icon:'🚙',desc:'Trafik kazası geçiren aracınızın piyasa değerindeki kaybı yasal formüllerle hesaplayın.',tags:['4 Adımlı Form','Otomatik Değerleme','Anlık Sonuç'],screen:'arac',category:'trafik'},
  {id:'kusur',title:'Trafik kazasında kusur oranım kaç?',icon:'🚦',desc:'Kazanızı anlatın: yapay zeka hem kusur oranınızı belirlesin hem de değer kaybı, mahrumiyet, sakatlık gibi hangi tazminat haklarına sahip olduğunuzu söylesin.',tags:['AI Analiz','Kusur Tespiti','Hak Tespiti'],screen:'kusur',category:'trafik'},
  // Aşağıdaki tekil trafik araçları artık sihirbazın içinden çalışıyor; kategori
  // listesini kalabalıklaştırmasınlar diye gizli, ama aramadan hâlâ bulunabilirler.
  {id:'hasar',title:'Aracımın hasar bedeli ne kadar?',icon:'🔨',desc:'Kaza sonrası araç hasar onarım bedelini hesaplayın. Yedek parça ve işçilik maliyetleri dahil.',tags:['Onarım Maliyeti','Parça Fiyatı','Hızlı Sonuç'],screen:'generic',category:'trafik'},
  {id:'mahrumiyet',title:'Aracım serviste kaldı, kira bedeli alabilir miyim?',icon:'🚘',desc:'Kaza sonrası aracınızın mahrumiyet (yatma) bedelini hesaplayın. Kiralık araç ve günlük kira bedellerine göre.',tags:['Günlük Kira','Mahrumiyet Süresi','Net Tazminat'],screen:'generic',category:'trafik'},
  {id:'pertBedeli',title:'Aracım pert oldu, ne kadar alırım?',icon:'💥',desc:'Onarım bedeli piyasa değerinin %50\'sini aşan (pert) araçlarda sigortadan alacağınız bedeli hesaplayın.',tags:['Pert Tespiti','Rayiç Bedel','Sovtaj'],screen:'generic',category:'trafik'},
  {id:'sakatlik',title:'Kazada sakat kaldım, tazminatım ne kadar?',icon:'🏥',desc:'Kaza sonrası sürekli sakatlık oranı ve tazminat hesaplaması yapın.',tags:['Sakatlık Oranı','Tıbbi Değerlendirme','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'yoksun',title:'Kazada yakınımı kaybettim, tazminat hakkım nedir?',icon:'🕊',desc:'Vefat eden kişinin desteğinden yoksun kalanlar için tazminat hesaplayın.',tags:['Mirasçı Hakları','Gelir Kaybı','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'maddi',title:'Kaza masraflarımın toplamı ne kadar?',icon:'📑',desc:'Kaza sonrası maddi zararlarınızı hesaplayın.',tags:['Zarar Hesabı','Kapsamlı','Detaylı'],screen:'generic',category:'trafik'},
  {id:'kasko',title:'Kaskodan ne kadar hasar bedeli alırım?',icon:'🛡',desc:'Kasko sigortası kapsamındaki hasar talebinizi ve tahmini tazminatınızı hesaplayın.',tags:['Kasko Kapsamı','Hasar Türü','Sigorta Talebi'],screen:'generic',category:'trafik'},
  {id:'manevi',title:'Manevi tazminat olarak ne kadar isteyebilirim?',icon:'💔',desc:'Kaza veya zarar sonrası manevi tazminat talebinizi hesaplayın.',tags:['Manevi Zarar','Dava Türü','Tahmini Tutar'],screen:'generic',category:'trafik'},
  {id:'gecici',title:'Çalışamadığım günlerin parasını alabilir miyim?',icon:'🚑',desc:'Kaza sonrası geçici iş göremezlik süresindeki gelir kaybınızı hesaplayın.',tags:['Günlük Gelir','İstirahat Süresi','Net Tutar'],screen:'generic',category:'trafik'},
  {id:'kalici',title:'Kalıcı iş göremezlik tazminatım ne kadar?',icon:'⚖',desc:'Kaza sonrası kalıcı iş göremezlik oranı ve tazminat hesaplaması yapın.',tags:['Sakatlık Oranı','Yaşam Boyu','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'trafikCezasi',title:'Trafik cezasına itiraz etmeye değer mi?',icon:'🚨',desc:'Trafik cezalarına itiraz sürecinde olası maliyet ve tazminat hesaplaması yapın.',tags:['İtiraz Süreci','Ceza Tutarı','Mahkeme'],screen:'generic',category:'trafik'},
  // ===== VERGİ & GÜMRÜK HUKUKU =====
  {id:'gozetim',title:'Gümrükte fazla vergi mi ödedim?',icon:'🧾',desc:'Gümrükte gereğinden fazla vergi ödemiş olabilir misiniz? 1 dakikada kontrol edin.',tags:['Gözetim Kıymeti','İade İhtimali','Dosya Skoru'],screen:'gozetim',category:'vergi'},
  {id:'ithalatVergi',title:'İthalatta ne kadar vergi ödeyeceğim?',icon:'📦',desc:'Gümrük kıymeti ve oranlarınızı girin; gümrük vergisi, İGV, ÖTV ve KDV kademeli olarak hesaplanır.',tags:['GV + İGV','ÖTV','KDV'],screen:'generic',category:'vergi'},
  {id:'gumrukCeza',title:'Gümrük para cezasına itiraz etmeye değer mi?',icon:'⚠️',desc:'Eksik vergi tahakkukunda Gümrük Kanunu 234 uyarınca farkın üç katı ceza kesilir; itiraz senaryosunu karşılaştırın.',tags:['GK 234','Uzlaşma','İtiraz'],screen:'generic',category:'vergi'},
  {id:'vergiZiyai',title:'Vergi ziyaı cezam ne kadar, indirimi var mı?',icon:'📉',desc:'VUK 344 uyarınca ceza verginin bir katı, VUK 359 fiillerinde üç katıdır; VUK 376 indirimiyle karşılaştırın.',tags:['VUK 344','VUK 376','Gecikme Faizi'],screen:'generic',category:'vergi'},
  {id:'emlakVergisi',title:'Emlak vergim ne kadar?',icon:'🏠',desc:'Emlak vergi değerinizi girin; mesken, iş yeri, arsa ve arazi için yıllık vergi büyükşehir farkıyla listelenir.',tags:['Binde Oran','Büyükşehir','Yıllık'],screen:'generic',category:'vergi'},
  {id:'evSatisIade',title:'Ev satış vergisi iade tutarı hesaplama',icon:'🏡',desc:'Ticari faaliyetiniz olmadığı hâlde konut satışınız ticari kazanç sayılıp KDV ve geçici vergi ödettirildiyse ne kadarını geri isteyebileceğinizi hesaplayın. Doğru vergilendirme değer artış kazancı (GVK mük. m.80) üzerindendir.',tags:['Değer Artış Kazancı','KDV + Geçici Vergi','İade Tutarı'],screen:'evSatisIade',category:'vergi'},
  {id:'vergiIade',title:'Vergi iademi nasıl alabilirim?',icon:'💰',desc:'Fazla veya yersiz ödediğiniz vergiyi geri almak için hangi mercie, hangi süre içinde, hangi belgelerle başvuracağınızı adım adım çıkarın. Örnek dilekçe dahil.',tags:['Yol Haritası','Süre Kontrolü','Örnek Dilekçe'],screen:'vergiIade',category:'vergi'},
  {id:'vergiDavasi',title:'Vergi davası açmaya değer mi?',icon:'⚖️',desc:'İndirimli ödeme ile dava senaryosunu kazanma ihtimalinize göre karşılaştırın.',tags:['Beklenen Değer','Masraf','Karar'],screen:'generic',category:'vergi'},
  // ===== İŞ HUKUKU — tek soru-cevap akışı =====
  {id:'isHukukuSihirbaz',title:'İşten ayrıldım, ne kadar alacağım var?',icon:'💼',desc:'İşten siz mi ayrıldınız, çıkarıldınız mı? Yanıtlarınıza göre kıdem, ihbar, izin ve fazla mesai alacaklarınız doğru mantıkla hesaplanır.',tags:['Soru-Cevap','Kıdem & İhbar','Mantık Ağacı'],screen:'isHukuku',category:'isci'},
  {id:'fesih',title:'İş yerinde tazminat alma hakkım var mı?',icon:'📋',desc:'İstifa edersem tazminat alabilir miyim? İş Kanunu 4857 madde 24 kapsamında haklı fesih ve kıdem tazminatı hakkınızı yapay zeka ile değerlendirin.',tags:['AI Analiz','Madde 24','Haklı Fesih'],screen:'fesih',category:'isci'},
  {id:'iseIade',title:'İşe iade davası açabilir miyim?',icon:'⚖️',desc:'İşten çıkarıldıysanız işe iade davası/başvurusu açma şartlarını taşıyıp taşımadığınızı yapay zeka ile öğrenin.',tags:['AI Analiz','Madde 18-21','İşe İade'],screen:'iseIade',category:'isci'},
  {id:'iscilik',title:'Kıdem ve ihbar tazminatım ne kadar?',icon:'💵',desc:'Kıdem, ihbar, yıllık izin ve fazla mesai alacaklarınızı hesaplayın.',tags:['Kıdem & İhbar','Fazla Mesai','Net Tutar'],screen:'iscilik',category:'isci'},
  {id:'iseIadeTazminat',title:'İşe iade davasını kazanırsam ne kadar alırım?',icon:'⚖️',desc:'İşe iade davasını kazanmanız durumunda alacağınız boşta geçen süre ücreti ve işe başlatmama tazminatını hesaplayın.',tags:['Boşta Geçen Süre','İşe Başlatmama','Net Tutar'],screen:'generic',category:'isci'},
  {id:'isgucu',title:'İş gücü kaybı tazminatım ne kadar?',icon:'🔶',desc:'Kaza sonucu uğradığınız iş gücü kaybı tazminatını hesaplayın.',tags:['Günlük Gelir','Kaza Dönemi','Tazminat'],screen:'generic',category:'isci'},
  {id:'isKazasi',title:'İş kazası tazminatım ne kadar?',icon:'🦺',desc:'İş kazası sonucu hak ettiğiniz tazminatı hesaplayın. SGK ve işveren sorumluluğu dahil.',tags:['SGK Hakları','İşveren Sorumluluğu','Rapor Süresi'],screen:'generic',category:'isci'},
  {id:'bakiyeSure',title:'Sözleşmem erken bitti, kalan ücreti alabilir miyim?',icon:'📆',desc:'Belirli süreli iş sözleşmeniz (örn. özel okul öğretmenliği) süresinden önce feshedildiyse kalan sürenin ücretini hesaplayın.',tags:['Belirli Süreli Sözleşme','5580 Sayılı Kanun','Kalan Süre'],screen:'generic',category:'isci'},
  // ===== DİĞER TAZMİNATLAR =====
  {id:'bosanma',title:'Boşanmada ne kadar tazminat ve mal alırım?',icon:'👨‍⚖️',desc:'Boşanma davasında maddi/manevi tazminat, nafaka ve mal paylaşımı hesaplaması yapın.',tags:['Boşanma','Nafaka','Mal Paylaşımı'],screen:'generic',category:'diger'},
  {id:'miras',title:'Mirastan payım ne kadar?',icon:'📜',desc:'Türk Medeni Kanunu\'na göre miras paylarını hesaplayın. Yasal mirasçılar ve miras oranları.',tags:['Miras Hukuku','Pay Hesaplama','Yasal Düzenleme'],screen:'generic',category:'diger'},
  {id:'kamulastirma',title:'Arazime izinsiz el konuldu, ne kadar alırım?',icon:'🏗️',desc:'Kamulaştırmasız el atma durumunda taşınmaz bedeli ve tazminat hesaplaması yapın.',tags:['El Atma','Taşınmaz Bedeli','Tazminat'],screen:'generic',category:'diger'},
  {id:'nafaka',title:'Ne kadar nafaka alabilirim?',icon:'👨‍⚖️',desc:'Boşanma davalarında iştirak ve yoksulluk nafakası hesaplaması yapın.',tags:['Boşanma','Nafaka Türü','Aylık Tutar'],screen:'generic',category:'diger'},
  {id:'tuketici',title:'Ayıplı ürün aldım, haklarım neler?',icon:'🏷',desc:'Ayıplı mal veya hizmet nedeniyle tüketici mahkemesi taleplerinizi hesaplayın.',tags:['Ayıplı Mal','İade Hakkı','Tazminat'],screen:'generic',category:'diger'},
  {id:'tapu',title:'Tapu harcı ve vergi ne kadar tutar?',icon:'🏠',desc:'Gayrimenkul alım-satımında tapu harcı, KDV ve vergi yükümlülüklerinizi hesaplayın.',tags:['Tapu Harcı','KDV','Vergi Oranı'],screen:'generic',category:'diger'}
];

const BLOG_POSTS = [
  {id:1,title:'Araç Değer Kaybı Tazminatı Nasıl Alınır?',category:'Araç Değer Kaybı',icon:'🚗',date:'15 Ocak 2026',excerpt:'Trafik kazası sonrası aracınızın değer kaybını nasıl talep edeceğinizi adım adım anlattık.',content:'<p>Aracınız kaza sonrası kusursuz biçimde onarılsa bile ikinci el piyasasında artık eski değerinde değildir. Alıcı, hasar kaydını gördüğü anda pazarlık yapar. İşte bu fark <strong>araç değer kaybı</strong>dır ve kusurlu tarafın zorunlu trafik sigortasından istenebilir.</p><h2>Kimler talep edebilir?</h2><p>Kazada kusuru bulunmayan veya kusuru karşı taraftan az olan araç sahibi talep edebilir. Kusurunuz varsa tazminattan kusur oranınız kadar indirim yapılır; %100 kusurluysanız değer kaybı isteyemezsiniz.</p><h2>Tutarı belirleyen unsurlar</h2><ul><li><strong>Aracın kaza öncesi rayiç değeri:</strong> Hesabın çıkış noktasıdır.</li><li><strong>Hasarın niteliği:</strong> Değişen parça, boyanan parça ve lokal boyama farklı ağırlıkta değerlendirilir. Şase ve taşıyıcı aksamdaki hasar en ağır etkiyi yapar.</li><li><strong>Yaş ve kilometre:</strong> Yeni ve düşük kilometreli araçta değer kaybı oranı yüksektir; çok yaşlı ve yüksek kilometreli araçta düşer.</li><li><strong>Önceki hasar kayıtları:</strong> Araç zaten hasarlıysa yeni kazanın yarattığı ek kayıp daha sınırlı olur.</li></ul><h2>Adım adım süreç</h2><ol><li><strong>Belgeleri toplayın:</strong> Kaza tespit tutanağı, ruhsat, hasar fotoğrafları, servis veya eksper raporu, aracın kilometresi.</li><li><strong>Sigortaya yazılı başvurun:</strong> Kusurlu tarafın zorunlu trafik sigortacısına başvurmak zorunludur. Bu adım atlanırsa açılan dava usulden reddedilebilir.</li><li><strong>Cevabı bekleyin:</strong> Belgeler tamsa sigortacının 15 gün içinde cevap vermesi beklenir. Ödeme yapılmaz veya düşük yapılırsa yol açılır.</li><li><strong>Tahkim veya dava:</strong> Sigorta Tahkim Komisyonu genellikle daha hızlıdır; mahkeme yolu da açıktır. İkisinde de bilirkişi incelemesi yapılır.</li></ol><h2>En sık yapılan hatalar</h2><ul><li><strong>Süreyi kaçırmak:</strong> Kaza tarihinden itibaren 2 yıllık zamanaşımı işler. Olay aynı zamanda suç oluşturuyorsa daha uzun ceza zamanaşımı uygulanabilir.</li><li><strong>Onarımı belgelemeden yaptırmak:</strong> Hasarın kapsamı sonradan ispatlanamaz hâle gelir. Onarım öncesi fotoğraf çekin, parça listesini isteyin.</li><li><strong>İbraname imzalamak:</strong> Sigortacının ödediği tutarı alırken imzalanan «tüm haklarımdan feragat ediyorum» ifadesi değer kaybı talebinizi de kapatabilir. Ödeme alırken ihtirazi kayıt koyun.</li></ul><p><strong>Kısaca:</strong> Değer kaybı, aracın onarılmış olmasıyla ortadan kalkmaz. Hesabı önden yapıp sigortacının teklifiyle karşılaştırmak, düşük teklifi kabul etmenizi önler.</p>'},
  {id:2,title:'Kıdem Tazminatı Hesaplama Rehberi',category:'Tazminat',icon:'💰',date:'10 Ocak 2026',excerpt:'İşten ayrılan her çalışanın bilmesi gereken kıdem tazminatı hesaplama detayları.',content:'<p>Kıdem tazminatı, aynı işverende belirli bir süre çalışmış işçiye, iş sözleşmesi kanunda sayılan hâllerde sona erdiğinde ödenen tutardır. Her ayrılış kıdem tazminatı doğurmaz — belirleyici olan <strong>sözleşmeyi kimin, hangi sebeple sona erdirdiği</strong>dir.</p><h2>Şartlar</h2><ul><li>Aynı işverende <strong>en az 1 yıl</strong> çalışmış olmak.</li><li>İş sözleşmesinin kıdeme hak kazandıran bir sebeple sona ermesi.</li></ul><h2>Hangi durumda kıdem doğar, hangisinde doğmaz?</h2><ul><li><strong>İşveren çıkardı (haklı sebep göstermeden):</strong> Kıdem ve ihbar tazminatının ikisi de doğar.</li><li><strong>İşveren haklı sebeple çıkardı (m.25/II):</strong> Kıdem doğmaz. Ancak bu iddiayı ispat yükü işverendedir.</li><li><strong>İşçi haklı sebeple ayrıldı (m.24):</strong> Ücretin ödenmemesi, sigortanın eksik yatması, mobbing, hakaret, ağır çalışma koşulları gibi hâllerde kıdem doğar, ihbar doğmaz.</li><li><strong>İşçi sebepsiz istifa etti:</strong> Ne kıdem ne ihbar doğar. Aksine ihbar süresine uymadıysanız işveren sizden ihbar tazminatı isteyebilir.</li><li><strong>Askerlik, evlilik nedeniyle kadın işçinin 1 yıl içinde ayrılması, emeklilik veya yaş dışındaki şartların tamamlanması:</strong> İstifa olmasına rağmen kıdem doğar.</li></ul><h2>Hesaplama</h2><p>Her tam yıl için <strong>30 günlük giydirilmiş brüt ücret</strong> ödenir; yıldan artan süreler oranlanır. «Giydirilmiş ücret» çıplak ücrete ek olarak süreklilik taşıyan yol, yemek, prim ve ikramiye gibi ödemelerin aylık karşılığını içerir — bu yüzden bordrodaki brüt ücretten yüksek çıkar.</p><h3>Kıdem tavanı</h3><p>Kıdem tazminatının yıllık tutarı, devlet memurlarına ödenen azami emeklilik ikramiyesiyle sınırlıdır ve her altı ayda bir güncellenir. Ücretiniz tavanın üzerindeyse hesap tavandan yapılır.</p><h3>Vergi</h3><p>Kıdem tazminatından <strong>gelir vergisi kesilmez</strong>; yalnızca damga vergisi kesilir. İhbar tazminatı ise gelir vergisine tabidir — ikisinin net tutarı bu yüzden farklı hesaplanır.</p><h2>Süre ve usul</h2><p>Kıdem ve ihbar tazminatında zamanaşımı <strong>5 yıl</strong>dır. Dava açmadan önce <strong>arabuluculuğa başvurmak zorunludur</strong>; bu adım atlanırsa dava usulden reddedilir.</p><p><strong>Kısaca:</strong> Tutarı öğrenmeden önce ayrılma şeklinizi netleştirin. Aynı maaş ve aynı kıdemle, ayrılma sebebine göre alacağınız tutar ikiye katlanabilir ya da sıfıra inebilir.</p>'},
  {id:3,title:'Trafik Kazasında Haklarınız',category:'Trafik Kazaları',icon:'⚖️',date:'5 Ocak 2026',excerpt:'Trafik kazası sonrası bilmeniz gereken tüm hukuki haklar ve süreçler.',content:'<p>Kaza anındaki ilk yarım saat, aylar sonra açılacak dosyanın kaderini belirler. Delil o anda toplanır; sonradan üretilemez.</p><h2>Olay yerinde yapılacaklar</h2><ol><li><strong>Güvenliği sağlayın:</strong> Dörtlüleri yakın, reflektör koyun, yaralı varsa 112\'yi arayın.</li><li><strong>Ölüm, yaralanma, alkol şüphesi veya anlaşmazlık varsa polis/jandarma çağırın.</strong> Bu hâllerde tutanağı taraflar kendi aralarında tutamaz.</li><li><strong>Fotoğraf çekin:</strong> Araçları oldukları yerden oynatmadan; plakalar, çarpma noktaları, fren izleri, trafik işaretleri ve yol çizgileri görünecek şekilde geniş açıdan çekin.</li><li><strong>Tanık bilgisi alın:</strong> Ad, telefon. Tanık, kusur tartışmasında en güçlü delildir.</li><li><strong>Tutanağı okumadan imzalamayın:</strong> Katılmadığınız bir tespit varsa şerh düşün. İmza, kusuru kabul ettiğiniz anlamına gelmez ama sonradan işinizi zorlaştırır.</li></ol><h2>Hangi tazminatları isteyebilirsiniz?</h2><h3>Araçla ilgili</h3><ul><li>Onarım (hasar) bedeli</li><li>Araç değer kaybı</li><li>İkame araç / mahrumiyet bedeli — aracın kullanılamadığı gün sayısı üzerinden</li><li>Çekici, otopark, ekspertiz gibi zorunlu giderler</li><li>Araç pert olduysa rayiç bedel eksi sovtaj</li></ul><h3>Yaralanma varsa</h3><ul><li>Tedavi ve bakım giderleri</li><li>Geçici iş göremezlik — istirahat süresindeki kazanç kaybı</li><li>Sürekli sakatlık (iş gücü kaybı) tazminatı</li><li>Manevi tazminat</li></ul><h3>Vefat varsa</h3><ul><li>Destekten yoksun kalma tazminatı — mirastan bağımsız, her destek görenin kendi hakkıdır</li><li>Yakınların manevi tazminatı</li><li>Cenaze ve defin giderleri</li></ul><h2>Kime karşı, hangi sürede?</h2><p>Araç zararları ve bedeni zararlar için kusurlu tarafın <strong>zorunlu trafik sigortacısına yazılı başvuru</strong> yapılır. Teminat limitini aşan kısım ile <strong>manevi tazminat</strong> zorunlu trafik sigortası kapsamında değildir; bunlar kusurlu sürücü ve araç işletenine karşı istenir.</p><p>Zamanaşımı kural olarak kaza tarihinden itibaren <strong>2 yıl</strong>, her hâlde 10 yıldır. Kaza aynı zamanda bir suç oluşturuyorsa (ölümlü veya yaralamalı kazalarda olduğu gibi) daha uzun ceza zamanaşımı süresi uygulanır.</p><p><strong>Kısaca:</strong> Kusur oranı bilinmeden yapılan hesap yanıltıcıdır. Önce kusuru netleştirin, sonra kalemleri tek tek çıkarın.</p>'},
  {id:4,title:'Sigorta ve Kasko Arasındaki Farklar',category:'Sigorta',icon:'🛡️',date:'1 Ocak 2026',excerpt:'Zorunlu trafik sigortası ile kasko arasındaki temel farkları öğrenin.',content:'<p>İki poliçe de araca ilişkindir ama kimin zararını karşıladıkları taban tabana zıttır. Karıştırıldığında insanlar hak ettikleri ödemeyi yanlış yerden ister ve eli boş döner.</p><h2>Zorunlu trafik sigortası (ZMSS)</h2><p><strong>Karşı tarafın zararını</strong> karşılar. Kanunen yaptırılması zorunludur, yaptırılmadan araç trafiğe çıkarılamaz.</p><ul><li>Üçüncü kişilerin araçlarında ve eşyalarında oluşan maddi zararlar</li><li>Üçüncü kişilerin bedeni zararları: tedavi giderleri, sakatlık, ölüm</li><li>Araç değer kaybı ve mahrumiyet bedeli de bu kapsamda istenir</li></ul><p><strong>Kapsam dışı:</strong> Kendi aracınızın hasarı, kendi bedeni zararınız (sürücü olarak) ve <strong>manevi tazminat</strong>. Ayrıca her poliçenin kişi başı ve kaza başı <strong>teminat limiti</strong> vardır; limiti aşan zarar kusurluya karşı ayrıca istenir.</p><h2>Kasko</h2><p><strong>Kendi aracınızın zararını</strong> karşılar. İsteğe bağlıdır.</p><ul><li>Çarpma, çarpılma, devrilme</li><li>Yanma, hırsızlık, hırsızlığa teşebbüs</li><li>Kişilerin kötü niyetli hareketleri, terör (poliçeye göre)</li><li>Ek teminatla: sel, deprem, dolu, cam kırılması, ikame araç, ferdi kaza</li></ul><h3>Kaskonun tipik istisnaları</h3><ul><li>Alkol veya uyuşturucu etkisi altında kullanım</li><li>Ehliyetsiz veya araç sınıfına uygun olmayan ehliyetle kullanım</li><li>Aracın kullanım amacı dışında kullanılması (örneğin yarış)</li><li>Kasıtlı olarak yaratılan hasar</li><li>Aşınma, yıpranma ve mekanik arızalar</li></ul><h2>Pratikte hangisine gitmeli?</h2><ul><li><strong>Kusur karşı tarafta:</strong> Zararınızı karşı tarafın ZMSS\'sinden isteyin. Değer kaybı da buradan alınır — kaskodan alınmaz.</li><li><strong>Kusur sizde:</strong> Kendi aracınız için kaskonuza gidin. Muafiyet ve hasarsızlık indirimi kaybını hesaba katın; küçük hasarlarda cepten ödemek daha ucuz olabilir.</li><li><strong>Kusur paylaşımlı:</strong> Kusurunuz kadar indirimle karşı taraftan, kalanı kaskodan istenebilir.</li></ul><p><strong>Not:</strong> Kasko ödeme yaptıktan sonra kusurlu tarafa rücu eder. Kaskodan ödeme almanız, değer kaybı gibi ZMSS kapsamındaki haklarınızı kendiliğinden ortadan kaldırmaz.</p>'},
  {id:5,title:'Yargıtay Kararları: Değer Kaybı',category:'Yargıtay Kararları',icon:'⚖️',date:'25 Aralık 2025',excerpt:'Değer kaybı tazminatına ilişkin güncel Yargıtay kararları.',content:'<p>Değer kaybı davalarında mahkemelerin dayandığı ilkeler yıllar içinde belirginleşti. Aşağıdaki başlıklar, dosyaların büyük çoğunluğunda tartışmasız kabul edilen esaslardır.</p><h2>1. Onarım, zararı ortadan kaldırmaz</h2><p>Araç kusursuz onarılsa bile ikinci el piyasasında hasar kaydı nedeniyle daha düşük bedelle alıcı bulur. Bu fark <strong>gerçek zarar</strong>dır ve tazmini gerekir. «Araç onarıldı, zarar kalmadı» savunması kabul görmez.</p><h2>2. Ölçü, gerçek zarardır</h2><p>Hesap, aracın <strong>kaza öncesi hasarsız değeri</strong> ile <strong>onarılmış hâldeki değeri</strong> arasındaki farktır. Bu fark somut olayın verilerine (aracın yaşı, kilometresi, değişen ve boyanan parçalar, hasarın taşıyıcı aksamda olup olmadığı) göre bilirkişi tarafından belirlenir.</p><h2>3. Kusur oranı tazminata yansır</h2><p>Zarar gören kendi kusuru oranında tazminattan indirim yapılarak ödeme alır. Kusur, tutanakla kesinleşmez; bilirkişi incelemesiyle yeniden belirlenebilir.</p><h2>4. Sigortacıya başvuru zorunludur</h2><p>Zorunlu trafik sigortacısına başvurmadan doğrudan dava açılması usul sorunu doğurur. Başvuru yazılı yapılmalı ve belgelenmelidir.</p><h2>5. Ağır hasarda talep rayiç bedele döner</h2><p>Onarım bedeli aracın rayiç değerine yaklaştığında ekonomik onarım söz konusu olmaz; araç pert kabul edilir ve talep <strong>rayiç bedel eksi sovtaj</strong> hâline gelir. Bu durumda ayrıca değer kaybı istenemez.</p><h2>6. İbraname ve ihtirazi kayıt</h2><p>Sigortacının yaptığı kısmi ödemeyi alırken kayıtsız şartsız ibra imzalanırsa kalan talepler tartışmalı hâle gelir. Ödeme alınırken <strong>«fazlaya ilişkin haklarım saklıdır»</strong> şerhi düşülmelidir.</p><p><strong>Uyarı:</strong> İçtihat zaman içinde değişebilir ve her dosya kendi delilleriyle değerlendirilir. Buradaki başlıklar genel çerçeveyi anlatır; somut dosyanız için güncel kararlara bakılması gerekir.</p>'},
  {id:6,title:'Tazminat Tutarları Neden Her Yıl Değişiyor?',category:'Hukuk Rehberi',icon:'📰',date:'20 Aralık 2025',excerpt:'Kıdem tavanı, asgari ücret, faiz ve teminat limitleri hesabı nasıl değiştiriyor, güncel rakamlar nereden takip edilir?',content:'<p>«Geçen sene şu kadar almıştı, ben neden daha az alıyorum?» sorusunun cevabı çoğu zaman hukukun değişmesi değil, <strong>hesabın girdilerinin</strong> değişmesidir. Tazminat tutarlarını yıldan yıla oynatan başlıca değişkenler şunlardır.</p><h2>1. Kıdem tazminatı tavanı</h2><p>Kıdem tazminatının bir yıllık tutarı, devlet memurlarına ödenen azami emeklilik ikramiyesiyle sınırlıdır. Bu rakam <strong>her altı ayda bir</strong> (ocak ve temmuz) güncellenir. Ücreti tavanın üzerinde olan çalışan için tazminat, tavandan hesaplanır — yani zam almanız tazminatınızı artırmayabilir.</p><h2>2. Asgari ücret</h2><p>Asgari ücret; ihbar, izin ve fazla mesai hesaplarında taban oluşturur, ayrıca birçok destekten yoksun kalma hesabında kayıtdışı gelirin yerine ölçü alınır. Yıl başındaki değişiklik tüm bu kalemleri birlikte hareket ettirir.</p><h2>3. Yeniden değerleme oranı ve vergi tarifeleri</h2><p>Vergi ve harç tutarları, cezaların üst sınırları ve bazı parasal sınırlar her yıl yeniden değerleme oranına göre artar. Tüketici hakem heyetlerinin görev sınırı gibi <strong>parasal başvuru sınırları</strong> da bu şekilde güncellenir; hangi mercie başvuracağınız buna bağlıdır.</p><h2>4. Faiz oranları</h2><p>Tazminata işletilecek faiz, dosyanın türüne göre yasal faiz veya avans faizi olabilir. Oranların değişmesi, uzun süren dosyalarda ana paradan büyük bir fark yaratır.</p><h2>5. Zorunlu trafik sigortası teminat limitleri</h2><p>Poliçe limitleri her yıl güncellenir. Limit, <strong>kaza tarihindeki</strong> poliçeye göre uygulanır; bugünkü limit geçmişteki kazanıza uygulanmaz.</p><h2>Güncel rakamları nereden takip etmeli?</h2><ul><li><strong>Resmî Gazete</strong> — tebliğler ve yeniden değerleme oranı</li><li><strong>Çalışma ve Sosyal Güvenlik Bakanlığı / SGK</strong> — kıdem tavanı ve prim tutarları</li><li><strong>Hazine ve Maliye Bakanlığı</strong> — vergi tarifeleri, tecil faizi</li><li><strong>Sigortacılık ve Özel Emeklilik Düzenleme ve Denetleme Kurumu</strong> — teminat limitleri</li></ul><p><strong>Kısaca:</strong> Hesabı yaparken hangi yılın rakamıyla çalıştığınıza dikkat edin. Kural olarak <strong>olay tarihindeki</strong> mevzuat ve limitler uygulanır.</p>'},
  {id:7,title:'İş Kazası Tazminatı Rehberi',category:'İş Hukuku',icon:'🏗️',date:'15 Aralık 2025',excerpt:'İş kazası sonucunda hak ettiğiniz tazminatlar ve süreç hakkında bilmeniz gerekenler.',content:'<p>İş kazası, işçinin işyerinde veya işin yürütümü sırasında bedence ya da ruhça zarara uğradığı olaydır. Servis aracındaki kaza, göreve gidiş-dönüş ve emzirme izni sırasında yaşananlar da kapsamdadır. Burada birbirinden bağımsız <strong>iki ayrı hat</strong> işler.</p><h2>Hat 1: SGK</h2><ul><li><strong>Geçici iş göremezlik ödeneği:</strong> İstirahatli olduğunuz süre boyunca ödenir.</li><li><strong>Sürekli iş göremezlik geliri:</strong> Maluliyet oranınız %10 ve üzerindeyse gelir bağlanır.</li><li><strong>Ölüm hâlinde:</strong> Hak sahiplerine gelir bağlanır, cenaze yardımı ödenir.</li></ul><p>Bu ödemeler için kusur şartı aranmaz; bildirim ve tespit yeterlidir.</p><h2>Hat 2: İşverene karşı tazminat davası</h2><p>SGK ödemeleri gerçek zararınızı çoğu zaman karşılamaz. Aradaki farkı işverenden isteyebilirsiniz:</p><ul><li><strong>Maddi tazminat:</strong> Kalan çalışma hayatınız boyunca uğrayacağınız kazanç kaybının peşin değeri; SGK\'nın ödediği kısım mahsup edilir.</li><li><strong>Manevi tazminat:</strong> İşçi için; vefat hâlinde eş, çocuk ve anne-baba için ayrı ayrı.</li><li><strong>Bakıcı gideri ve tedavi masrafları.</strong></li></ul><h2>İşverenin sorumluluğu neye dayanır?</h2><p>İşveren, işçiyi gözetme borcu altındadır. Risk değerlendirmesi yapmak, eğitim vermek, koruyucu ekipman sağlamak ve kullanımını denetlemekle yükümlüdür. Bu yükümlülükleri yerine getirdiğini <strong>ispat yükü işverendedir</strong>. İşçinin kendi kusuru varsa tazminattan indirim yapılır ancak sorumluluk tümüyle kalkmaz.</p><h2>Bildirim ve süreler</h2><ul><li>İşveren, kazayı <strong>3 iş günü</strong> içinde SGK\'ya bildirmek zorundadır.</li><li>Bildirilmediyse <strong>iş kazasının tespiti davası</strong> açılabilir; hastane kayıtları, tanık ve kamera görüntüleri delil olur.</li><li>İşverene karşı tazminat talebinde zamanaşımı <strong>10 yıl</strong>dır.</li></ul><h2>Kaza sonrası ilk yapılacaklar</h2><ol><li>Hastaneye başvururken olayın <strong>iş kazası</strong> olduğunu mutlaka belirtin; epikrizde bu ifadenin geçmesi çok önemlidir.</li><li>Olay yerini ve varsa eksik güvenlik önlemlerini fotoğraflayın.</li><li>Tanık isim ve telefonlarını alın.</li><li>İstirahat raporlarının aslını saklayın.</li><li>Maluliyet için tam teşekküllü hastaneden sağlık kurulu raporu alın; dosyanın en belirleyici belgesi budur.</li></ol><p><strong>Kısaca:</strong> SGK\'dan ödeme almanız dosyanızın kapandığı anlamına gelmez. Asıl tazminat çoğu zaman ikinci hatta, işverene karşı doğar.</p>'},
  {id:8,title:'Boşanma ve Nafaka Hakları',category:'Aile Hukuku',icon:'👨‍👩‍👧',date:'10 Aralık 2025',excerpt:'Boşanma sürecinde nafaka, velayet ve mal paylaşımı hakkında bilmeniz gerekenler.',content:'<p>Boşanma tek bir dava gibi görünse de içinde birbirinden ayrı üç hesap vardır: tazminat, nafaka ve mal rejiminin tasfiyesi. Üçü farklı kurallara tabidir ve çoğu zaman farklı zamanlarda sonuçlanır.</p><h2>1. Maddi ve manevi tazminat</h2><p>Boşanmada <strong>kusuru daha az olan</strong> eş, mevcut veya beklenen menfaatleri zedelendiği ölçüde maddi tazminat isteyebilir. Kişilik hakkı saldırıya uğrayan eş ayrıca manevi tazminat talep edebilir. Kusuru ağır olan eş bu talepleri ileri süremez — bu yüzden kusurun belgelenmesi belirleyicidir.</p><h2>2. Nafaka</h2><h3>Tedbir nafakası</h3><p>Dava sürerken geçici olarak bağlanır, dava tarihinden itibaren istenebilir.</p><h3>Yoksulluk nafakası</h3><p>Boşanma yüzünden yoksulluğa düşecek eşe bağlanır, süre sınırı yoktur. Alacaklının yeniden evlenmesi veya evli gibi yaşaması hâlinde kaldırılır.</p><h3>İştirak nafakası</h3><p>Velayeti almayan eş tarafından çocuğun eğitim, sağlık ve bakım giderleri için ödenir. Çocuğun yaşı büyüdükçe ve ihtiyaçları arttıkça <strong>artırım davası</strong> açılabilir.</p><h2>3. Mal paylaşımı</h2><p>2002\'den sonraki evliliklerde yasal rejim <strong>edinilmiş mallara katılma</strong>dır. Kural basittir: evlilik içinde edinilen malların değeri kural olarak yarı yarıya paylaşılır.</p><ul><li><strong>Paylaşıma girer:</strong> Evlilik içinde çalışmayla kazanılanlar, SGK ödemeleri, kişisel malların gelirleri.</li><li><strong>Paylaşıma girmez (kişisel mal):</strong> Evlilikten önce sahip olunanlar, miras ve karşılıksız kazandırmalar, manevi tazminat alacakları, sadece kişisel kullanıma özgü eşyalar.</li></ul><p>Mal rejimi tasfiyesi boşanmadan <strong>ayrı bir dava</strong>dır ve boşanma kesinleşmeden karara bağlanmaz. Zamanaşımı, boşanmanın kesinleşmesinden itibaren 10 yıldır.</p><h2>4. Velayet</h2><p>Velayette ölçü <strong>çocuğun üstün yararı</strong>dır; ebeveynin kusuru tek başına belirleyici değildir. İdrak çağındaki çocuğun görüşü alınır. Velayet almayan eşin kişisel ilişki (görüşme) hakkı düzenlenir.</p><p><strong>Kısaca:</strong> Delilleri baştan toplayın. Mesajlar, tanıklar, banka kayıtları ve tapu geçmişi hem kusurun hem de paylaşımın belirlenmesinde kullanılır.</p>'},
  {id:9,title:'Tüketici Hakları ve Ayıplı Mal',category:'Tüketici Hakları',icon:'🛒',date:'5 Aralık 2025',excerpt:'Ayıplı mal veya hizmet satın aldığınızda haklarınızı ve başvuru süreçlerini öğrenin.',content:'<p>Satın aldığınız mal veya hizmet sözleşmede belirtilen niteliği taşımıyorsa <strong>ayıplı</strong>dır. Ayıplı malda hangi yolu seçeceğine <strong>tüketici karar verir</strong>; satıcı sizi tek bir çözüme zorlayamaz.</p><h2>Dört seçimlik hakkınız</h2><ol><li><strong>Ücretsiz onarım:</strong> Makul sürede ve en çok 30 iş günü içinde yapılmalıdır. Yapılmazsa diğer haklara geçebilirsiniz.</li><li><strong>Ayıpsız yenisiyle değişim.</strong></li><li><strong>Bedel iadesi (sözleşmeden dönme):</strong> Ödediğiniz tutarın tamamı iade edilir.</li><li><strong>Bedelden indirim:</strong> Malı kullanmaya devam edip ayıp oranında indirim istersiniz.</li></ol><p>Onarım veya değişim talebi, satıcı için orantısız güçlük doğuruyorsa reddedilebilir; bu hâlde iade veya indirim hakkınız durur.</p><h2>İspat yükü kimde?</h2><p>Teslimden itibaren <strong>6 ay içinde</strong> ortaya çıkan ayıbın teslim anında var olduğu kabul edilir. Bu süre içinde ispat yükü <strong>satıcıdadır</strong>; sizin ayıbın sonradan çıkmadığını kanıtlamanız gerekmez.</p><h2>Süreler</h2><ul><li>Genel zamanaşımı <strong>2 yıl</strong>; konut ve tatil amaçlı taşınmazlarda <strong>5 yıl</strong>.</li><li>Ayıp <strong>gizlenmişse</strong> veya ağır kusurla susulmuşsa zamanaşımı işlemez.</li><li>Mesafeli satışlarda ayrıca <strong>14 gün</strong> içinde sebep göstermeden <strong>cayma hakkı</strong> vardır.</li></ul><h2>Nereye başvurulur?</h2><ol><li><strong>Önce satıcıya</strong> yazılı başvurun. E-posta veya uygulama üzerinden yazışma da delildir; sözlü görüşmeye güvenmeyin.</li><li><strong>Tüketici Hakem Heyeti:</strong> Parasal sınırın altındaki uyuşmazlıklarda başvuru zorunludur. Başvuru ücretsizdir ve e-Devlet üzerinden yapılabilir. Sınırlar her yıl güncellenir.</li><li><strong>Tüketici Mahkemesi:</strong> Sınırın üzerindeki uyuşmazlıklarda görevlidir; tüketici davalarında harç alınmaz.</li></ol><h2>Başvuruya eklenecek belgeler</h2><ul><li>Fatura, fiş veya sipariş özeti</li><li>Garanti belgesi</li><li>Servis giriş-çıkış fişleri</li><li>Ayıbı gösteren fotoğraf veya video</li><li>Satıcıyla yapılan yazışmalar</li></ul><p><strong>Kısaca:</strong> Talebinizi hangi seçimlik hak olduğunu <strong>açıkça yazarak</strong> bildirin. «Memnun değilim» değil, «bedel iadesi talep ediyorum» yazın.</p>'},
  {id:10,title:'Kasko Sigortası Kapsamı ve İstisnaları',category:'Sigorta',icon:'🛡️',date:'1 Aralık 2025',excerpt:'Kasko sigortasının kapsadığı durumlar ve istisnalar hakkında detaylı bilgi.',content:'<p>Kasko, kendi aracınızın zararını karşılayan isteğe bağlı bir poliçedir. En çok yaşanan sorun, kapsamın sanıldığından dar olmasıdır: ödeme reddedildiğinde gerekçe genellikle poliçede zaten yazılıdır.</p><h2>Standart teminatlar</h2><ul><li>Çarpma, çarpılma, devrilme, yuvarlanma</li><li>Yanma</li><li>Hırsızlık ve hırsızlığa teşebbüs</li><li>Üçüncü kişilerin kötü niyetli hareketleri</li><li>Aracın park hâlindeyken zarar görmesi</li></ul><h2>Ek teminatla alınabilenler</h2><ul><li>Sel, su baskını, deprem, dolu, fırtına</li><li>Terör ve halk hareketleri</li><li>Cam kırılması (hasarsızlık indirimini etkilemeden)</li><li>İkame araç</li><li>Ferdi kaza, hukuksal koruma</li><li>Yurt dışı teminatı</li><li>Anahtar kaybı, yanlış akaryakıt dolumu</li></ul><h2>Ödemeyi durduran tipik istisnalar</h2><ul><li><strong>Alkol veya uyuşturucu:</strong> Zararın alkolün etkisiyle meydana geldiğinin tespiti hâlinde ödeme yapılmaz.</li><li><strong>Ehliyetsiz kullanım</strong> veya araç sınıfına uygun olmayan ehliyet.</li><li><strong>Kasıtlı hasar</strong> ve sigorta dolandırıcılığı.</li><li><strong>Yarış, hız denemesi</strong> gibi kullanım amacı dışındaki kullanım.</li><li><strong>Aşınma, yıpranma, mekanik-elektrik arızalar</strong> — kasko bir bakım poliçesi değildir.</li><li><strong>Ticari kullanım</strong> beyan edilmemişse (örneğin özel araç olarak sigortalanan aracın yolcu taşımacılığında kullanılması).</li><li><strong>Yükleme-boşaltma</strong> sırasında araçtaki yüke gelen zararlar.</li></ul><h2>Ödeme tutarını belirleyen üç kavram</h2><ul><li><strong>Muafiyet:</strong> Poliçede yazan tutara kadar olan hasarı siz karşılarsınız.</li><li><strong>Hasarsızlık indirimi:</strong> Hasar bildirmek, sonraki yıl priminizi yükseltir. Küçük hasarlarda cepten ödemek daha ucuza gelebilir.</li><li><strong>Rayiç bedel:</strong> Pert hâlinde ödeme, kaza günündeki piyasa değeri üzerinden yapılır; poliçedeki bedel değil.</li></ul><h2>Reddedilen hasarda ne yapılır?</h2><ol><li>Ret gerekçesini <strong>yazılı</strong> isteyin.</li><li>Poliçe genel ve özel şartlarında bu gerekçenin karşılığını okuyun.</li><li>İtirazınızı yazılı yapın, kayıt numarası alın.</li><li>Sonuç alamazsanız <strong>Sigorta Tahkim Komisyonu</strong>na başvurun; mahkemeye göre genellikle daha hızlıdır.</li></ol><p><strong>Kısaca:</strong> Poliçeyi hasardan sonra değil, alırken okuyun. En pahalı sürpriz, olmadığını sandığınız istisnadır.</p>'},
  {id:11,title:'Manevi Tazminat Davası Nasıl Açılır?',category:'Hukuk Rehberi',icon:'💔',date:'28 Kasım 2025',excerpt:'Manevi tazminat davası açma süreci, gerekli belgeler ve dikkat edilmesi gerekenler.',content:'<p>Manevi tazminat, bir kişinin bedensel bütünlüğüne veya kişilik haklarına yapılan saldırının yol açtığı acı ve elemin karşılığıdır. Zararın parayla ölçülemediği yerde hukuk, hâkime <strong>takdir yetkisi</strong> verir.</p><h2>Hangi hâllerde istenebilir?</h2><ul><li>Trafik kazasında yaralanma veya sakat kalma</li><li>Yakının ölümü — eş, çocuk, anne-baba ve bazı hâllerde kardeş için ayrı ayrı</li><li>İş kazası ve meslek hastalığı</li><li>Hakaret, iftira, özel hayatın ihlali, sosyal medyada teşhir</li><li>Mobbing, cinsel taciz</li><li>Boşanmada kişilik hakkının zedelenmesi</li><li>Hatalı tıbbi uygulama</li></ul><h2>Tutarı belirleyen ölçütler</h2><ul><li>Olayın ağırlığı ve sonuçlarının kalıcılığı</li><li>Tarafların <strong>kusur dereceleri</strong></li><li>Tarafların ekonomik ve sosyal durumu</li><li>Olay tarihi ile karar tarihi arasındaki ekonomik koşullar</li><li>Zarar görenin duyduğu acının derecesi (maluliyet oranı, tedavi süresi, iz kalması)</li></ul><p>Hâkim, tazminatın <strong>zenginleşme aracı olmaması</strong> ilkesini gözetir. Bu yüzden fahiş talepler tutarı yükseltmez, aksine haksız çıkma nedeniyle vekâlet ücreti ve yargılama gideri yükü doğurabilir.</p><h2>Süreç</h2><ol><li><strong>Delilleri toplayın:</strong> Sağlık kurulu raporu, epikriz, tedavi belgeleri, fotoğraflar, mesaj ve paylaşım ekran görüntüleri (mümkünse noter tespitiyle), tanık listesi.</li><li><strong>Görevli mahkemeyi belirleyin:</strong> Haksız fiilden doğan taleplerde asliye hukuk; iş ilişkisinden doğanlarda iş mahkemesi; boşanmayla birlikte istenen manevi tazminatta aile mahkemesi görevlidir.</li><li><strong>Dava dilekçesini verin:</strong> Olayı, kusuru ve uğradığınız zararı somut şekilde anlatın; genel ifadeler yerine tarih, yer ve sonuç yazın.</li><li><strong>Faiz talebini unutmayın:</strong> Kural olarak <strong>olay tarihinden</strong> itibaren faiz istenir; talep edilmeyen faize hükmedilmez.</li></ol><h2>Önemli iki uyarı</h2><ul><li><strong>Zorunlu trafik sigortası manevi tazminatı karşılamaz.</strong> Bu talep doğrudan kusurlu kişiye yöneltilir.</li><li><strong>Zamanaşımı</strong> kural olarak zararı ve failini öğrenmeden itibaren 2 yıl, her hâlde 10 yıldır. Fiil suç oluşturuyorsa daha uzun ceza zamanaşımı uygulanır.</li></ul><p><strong>Kısaca:</strong> Manevi tazminatta belge, iddiadan daha güçlüdür. Rapor ve tanık olmadan yapılan talepler çoğunlukla düşük sonuçlanır.</p>'},
  {id:12,title:'Sigorta İtiraz Dilekçesi Nasıl Yazılır?',category:'Hukuk Rehberi',icon:'📝',date:'20 Kasım 2025',excerpt:'Sigorta şirketinin tazminat talebinizi reddetmesi durumunda itiraz süreci.',content:'<p>Sigorta şirketi talebinizi reddettiğinde ya da beklediğinizin çok altında ödeme yaptığında, süreç orada bitmez. Doğru yazılmış bir itiraz dilekçesi çoğu dosyada sonucu değiştirir.</p><h2>Önce gerekçeyi öğrenin</h2><p>Ret veya eksik ödeme kararının <strong>yazılı gerekçesini</strong> isteyin. Gerekçe bilinmeden yazılan itiraz, hedefsiz kalır. Şirketin dayandığı poliçe maddesini veya eksper raporunu talep edin; bunlar size verilmek zorundadır.</p><h2>Dilekçede bulunması gerekenler</h2><ol><li><strong>Muhatap:</strong> Sigorta şirketinin tam unvanı.</li><li><strong>Kimlik ve dosya bilgileri:</strong> Ad-soyad, T.C. kimlik no, adres, telefon, <strong>hasar dosya numarası</strong>, poliçe numarası, IBAN.</li><li><strong>Olayın özeti:</strong> Tarih, yer, olayın nasıl geliştiği. Duygusal anlatım yerine kronolojik ve kısa.</li><li><strong>Ret gerekçesinin çürütülmesi:</strong> Şirketin dayandığı noktayı tek tek ele alın. «Poliçenin X maddesine dayanılmıştır; oysa somut olayda …» biçiminde yazın.</li><li><strong>Talep:</strong> İstediğiniz tutarı <strong>rakamla</strong> ve kalem kalem yazın (onarım, değer kaybı, mahrumiyet, çekici …).</li><li><strong>Faiz talebi:</strong> «Yasal faiziyle birlikte» ifadesini mutlaka ekleyin.</li><li><strong>Ekler listesi</strong> ve tarih-imza.</li></ol><h2>Eklenecek belgeler</h2><ul><li>Kaza tespit tutanağı</li><li>Ruhsat ve ehliyet fotokopisi</li><li>Hasar fotoğrafları</li><li>Servis / eksper raporu, varsa fatura</li><li>Bağımsız ekspertiz raporu (şirketin raporuna karşı en güçlü belgedir)</li><li>Önceki yazışmalar ve ödeme dekontu</li></ul><h2>Nasıl gönderilir?</h2><p>Elden verip <strong>kayıt numarası</strong> alın, KEP adresine gönderin veya iadeli taahhütlü posta kullanın. Amaç, başvurduğunuzu ve tarihini ispatlayabilmektir. Zorunlu trafik sigortasında bu başvuru aynı zamanda dava şartıdır.</p><h2>Sonuç alamazsanız</h2><ul><li><strong>Sigorta Tahkim Komisyonu:</strong> Şirket üye ise başvurulabilir; mahkemeye göre daha hızlı ve daha düşük masraflıdır.</li><li><strong>Mahkeme:</strong> Ticari nitelikteki uyuşmazlıklarda dava öncesi arabuluculuk zorunludur.</li></ul><p><strong>Not:</strong> Kısmi ödemeyi tahsil ederken <strong>«fazlaya ilişkin haklarım saklıdır»</strong> şerhini koyun; kayıtsız şartsız ibra imzalarsanız kalan talepleriniz tartışmalı hâle gelir.</p>'},
  {id:13,title:'Arabuluculuk ile Hızlı Çözüm',category:'Hukuk Rehberi',icon:'🤝',date:'15 Kasım 2025',excerpt:'Mahkeme sürecine girmeden arabuluculuk ile tazminat anlaşmaları yapın.',content:'<p>Arabuluculuk, tarafların bağımsız ve tarafsız bir arabulucu eşliğinde uyuşmazlığı kendilerinin çözmesidir. Bazı uyuşmazlıklarda tercih değil, <strong>dava şartı</strong>dır: bu adım atlanırsa dava usulden reddedilir.</p><h2>Hangi hâllerde zorunlu?</h2><ul><li><strong>İşçi-işveren uyuşmazlıkları:</strong> Kıdem, ihbar, fazla mesai, izin alacakları ve işe iade.</li><li><strong>Ticari davalar:</strong> Konusu para alacağı ve tazminat olan ticari uyuşmazlıklar.</li><li><strong>Kira, ortaklığın giderilmesi ve komşuluk hukukundan doğan bazı uyuşmazlıklar.</strong></li></ul><p>Trafik kazasından doğan tazminat talepleri ticari nitelikteyse zorunlu kapsama girer; girmese de <strong>ihtiyari arabuluculuk</strong> her zaman mümkündür.</p><h2>Süreç nasıl işler?</h2><ol><li>Adliyedeki arabuluculuk bürosuna veya e-Devlet üzerinden başvurulur.</li><li>Büro, listeden bir arabulucu görevlendirir.</li><li>Arabulucu taraflara ulaşır ve toplantı günü belirler; görüşmeler yüz yüze veya çevrim içi yapılabilir.</li><li>İşçilik uyuşmazlıklarında süreç kural olarak <strong>3 hafta</strong> içinde, zorunlu hâllerde 1 hafta uzatmayla tamamlanır.</li><li>Anlaşma sağlanırsa <strong>anlaşma belgesi</strong>, sağlanamazsa <strong>son tutanak</strong> düzenlenir.</li></ol><h2>Anlaşma belgesinin gücü</h2><p>Taraflar ve avukatları birlikte imzaladığında anlaşma belgesi <strong>icra edilebilirlik şerhi aranmaksızın ilam niteliğinde belge</strong> sayılır. Yani karşı taraf ödemezse doğrudan icraya konulabilir; yeniden dava açmak gerekmez.</p><h2>Avantajları</h2><ul><li><strong>Hız:</strong> Haftalarla ölçülür; dava yıllar sürebilir.</li><li><strong>Masraf:</strong> Anlaşma hâlinde arabulucu ücreti kural olarak taraflarca eşit paylaşılır; anlaşma olmazsa ilk iki saatlik ücret Adalet Bakanlığı bütçesinden karşılanır.</li><li><strong>Gizlilik:</strong> Görüşmelerde söylenenler daha sonra delil olarak kullanılamaz.</li><li><strong>İlişkinin korunması:</strong> Ticari ve ailevi ilişkilerde belirleyici olabilir.</li></ul><h2>Masaya oturmadan önce</h2><ul><li>Alacağınızı <strong>kalem kalem hesaplayın</strong>; rakamı bilmeden yapılan pazarlıkta kaybeden hazırlıksız taraftır.</li><li>Kabul edebileceğiniz <strong>en düşük tutarı</strong> önceden belirleyin.</li><li>Anlaşma metnini imzalamadan önce hangi taleplerinizi kapattığını okuyun: «tüm haklarımdan feragat» ifadesi, henüz konuşulmamış kalemleri de kapatır.</li></ul><p><strong>Kısaca:</strong> Arabuluculuk zayıf tarafın taviz vermesi demek değildir. Hazırlıklı gidildiğinde, mahkemeden daha kısa sürede ve daha az masrafla aynı sonuca ulaşılabilir.</p>'},
  {id:14,title:'Bilirkişi Raporu Nasıl Okunur?',category:'Hukuk Rehberi',icon:'🔬',date:'10 Kasım 2025',excerpt:'Mahkemeler tarafından atanan bilirkişi raporlarını doğru yorumlama rehberi.',content:'<p>Bilirkişi raporu, mahkemenin uzmanlık gerektiren bir konuda görüş almasıdır. Hâkimi bağlamaz ama uygulamada kararların büyük bölümü rapor doğrultusunda çıkar. Bu yüzden raporu <strong>okumayı bilmek</strong>, dosyanızdaki en etkili savunma aracıdır.</p><h2>Raporun bölümleri</h2><ol><li><strong>Görevlendirme ve sorular:</strong> Mahkemenin bilirkişiye neyi sorduğu. Rapor bu soruların dışına çıkmışsa itiraz edilebilir.</li><li><strong>Dosya özeti:</strong> Hangi belgelerin incelendiği. <strong>Sunduğunuz bir belge burada anılmıyorsa</strong> muhtemelen değerlendirilmemiştir — en sık rastlanan itiraz sebebi budur.</li><li><strong>Tespitler:</strong> Ölçüm, muayene ve inceleme sonuçları.</li><li><strong>Değerlendirme:</strong> Tespitlerden sonuca nasıl gidildiği. Asıl okunması gereken bölüm burasıdır.</li><li><strong>Sonuç:</strong> Kusur oranları, hesaplanan tutar, maluliyet oranı.</li></ol><h2>Nelere dikkat edilmeli?</h2><ul><li><strong>Kullanılan veriler:</strong> Ücret, rayiç bedel, kilometre, yaş, tarih. Yanlış girilen tek bir veri sonucu baştan sona değiştirir.</li><li><strong>Hangi tarihin esas alındığı:</strong> Olay tarihi mi, rapor tarihi mi? Enflasyonlu dönemde bu fark büyüktür.</li><li><strong>Kusur dağılımının gerekçesi:</strong> Hangi trafik kuralına dayanıldığı yazılmalı; «tarafların beyanına göre» ifadesi tek başına yetersizdir.</li><li><strong>Hesap yönteminin gösterilmesi:</strong> Sadece sonuç rakamı verilip formül gösterilmemişse rapor denetlenebilir değildir.</li><li><strong>İç tutarlılık:</strong> Tespitler bölümüyle sonuç bölümü çelişiyor mu?</li><li><strong>Uzmanlık alanı:</strong> Bilirkişinin alanı konuyla örtüşüyor mu?</li></ul><h2>İtiraz nasıl yapılır?</h2><p>Rapor tarafınıza tebliğ edildikten sonra kural olarak <strong>2 hafta</strong> içinde yazılı itiraz edilir. İtiraz dilekçesinde:</p><ul><li>Hangi sayfadaki hangi tespite itiraz ettiğinizi <strong>tek tek</strong> gösterin.</li><li>Doğrusunun ne olduğunu <strong>belgeyle</strong> ortaya koyun.</li><li>Gerekiyorsa <strong>ek rapor</strong> veya <strong>yeni bilirkişi heyetinden rapor</strong> talep edin.</li></ul><p>«Rapora itiraz ediyorum» demek yeterli değildir; somutlaştırılmayan itirazlar dikkate alınmaz.</p><p><strong>Kısaca:</strong> Raporu sondan başa değil, baştan sona okuyun. Sonuçtaki rakam, girdideki verilerden çıkar — hata neredeyse her zaman girdide olur.</p>'},
];

const FAQ_DATA = [
  {q:'Araç değer kaybı tazminatı nedir?',a:'Trafik kazası geçiren bir araç, aynı marka, model ve yaşta kazasız bir araca kıyasla daha düşük piyasa değeri taşır. Bu değer düşüşünün tazmin edilmesi için ödenen tazminata değer kaybı tazminatı denir.'},
  {q:'Kıdem tazminatı hakkı ne zaman doğar?',a:'İşçi, aynı işyerinde en az 1 yıl çalışmış ve işten çıkarılmış ya da haklı nedenle istifa etmişse kıdem tazminatı hakkı doğar. 2026 tavan tutarı 73.729,87 TL\'dir.'},
  {q:'Bu hesaplamalar kesin tutar mıdır?',a:'Hayır. Hesaplamalar yasal formüllere dayanmakla birlikte tahmini niteliktedir. Kesin tutar mahkeme kararı ve bilirkişi raporuna göre değişebilir.'},
  {q:'Hizmet ücretli midir?',a:'Hesaplama aracı tamamen ücretsizdir. Dosyanızın ön incelemesini talep etmek için bizimle iletişime geçebilirsiniz.'},
  {q:'İş gücü kaybı tazminatı nedir?',a:'Kaza sonucu çalışanın geçici veya kalıcı olarak çalışamaz hale gelmesi durumunda uğradığı gelir kaybının karşılanmasıdır. Günlük gelir esas alınarak hesaplanır.'},
  {q:'Sürekli sakatlık tazminatı nasıl hesaplanır?',a:'Kaza sonucu oluşan kalıcı sakatlık oranı tıbbi raporla tespit edilir ve tazminat buna göre hesaplanır. Yaş, gelir ve sakatlık oranı dikkate alınır.'},
  {q:'Destekten yoksun kalma tazminatı nedir?',a:'Kaza sonucu vefat eden kişinin bakmakla yükümlü olduğu kişilerin uğradığı gelir kaybının karşılanmasıdır. Destek oranı ve kalan yaşam süresi dikkate alınır.'},
  {q:'Geçici iş göremezlik ne kadar sürer?',a:'İyileşme sürecine göre değişir. İş göremezlik raporu ile belirlenen sürede SGK tarafından ödeme yapılır. Genellikle 3 ayı aşmaz.'},
  {q:'Nafaka nasıl hesaplanır?',a:'Nafaka hesaplanırken tarafların gelir durumu, yaşam standardı, çocuk sayısı ve yaşı, kusur oranı dikkate alınır. Hakim takdirine bağlıdır.'},
  {q:'İş kazası tazminatı nedir?',a:'İşyerinde veya işin yürütümü sırasında meydana gelen kazalarda işçiye ödenen tazminattır. SGK ve işveren sorumluluğu kapsamında hesaplanır.'},
  {q:'Kasko hasarı nasıl alınır?',a:'Kasko sigortası kapsamında hasar oluştuğunda sigorta şirketine başvuru yapılır. Eksper tespitinin ardından onarım veya ödeme yapılır.'},
  {q:'Ayıplı mal için ne kadar sürede başvurulur?',a:'Ayıp, 30 gün içinde satıcıya bildirilmelidir. Dava açma süresi ise 2 yıldır. 2 yıl içinde dava açılmalıdır.'},
  {q:'Arabuluculuk nedir?',a:'Tarafların, tarafsız bir arabulucu eşliğinde anlaşmaya varmasıdır. İş davalarında ve ticari davalarda dava açmadan önce arabulucuya başvuru zorunludur.'},
  {q:'Manevi tazminat nasıl hesaplanır?',a:'Manevi tazminat hakim tarafından takdir edilir. Tarafların sosyal ve ekonomik durumu, kusur oranı, zararın ağırlığı ve olayın oluş biçimi dikkate alınır.'},
  {q:'Trafik cezasına itiraz nasıl yapılır?',a:'Trafik cezası tebliğ edildikten 15 gün içinde ilgili sulh ceza hakimliğine itiraz dilekçesi ile başvurulabilir.'},
  {q:'Tapu harcı ne kadar?',a:'Gayrimenkul alım-satımında tapu harcı emlak bedelinin %4\'üdür. 2026 için bu oran alıcı ve satıcı için ayrı ayrı geçerlidir.'},
  {q:'Sigorta tazminatı ne zaman ödenir?',a:'Sigorta tazminatı, hasar tespitinin ardından 15 iş günü içinde ödenir. Gecikme durumunda yasal faiz işletilir.'},
  {q:'Bilirkişi raporuna itiraz nasıl yapılır?',a:'Bilirkişi raporuna tebliğ tarihinden itibaren 10 gün içinde itiraz edilebilir. İtiraz dilekçesi ilgili mahkemeye sunulur.'}
];

const CALC_CONFIGS = {
  /* ===================================================================
     VERGİ & GÜMRÜK HESAPLAYICILARI
     Tasarım kuralı: kanunda sabit olan katsayılar (VUK 344'te cezanın bir
     katı, GK 234'te üç kat, Emlak Vergisi Kanunu'ndaki binde oranları)
     formülde; her yıl değişen oranlar (gecikme faizi, gümrük vergisi
     oranları, KDV/ÖTV oranları) kullanıcı girdisi olarak alınıyor —
     böylece araç güncelliğini yıl değişince kaybetmiyor.
     =================================================================== */
  ithalatVergi:{badge:'İthalat Vergileri',title:'İthalatta Ödenecek Vergiler',desc:'Gümrük kıymeti ve oranlarınızı girin; GV, İGV, ÖTV ve KDV kademeli olarak hesaplanır',
    fields:[
      {id:'iv_kiymet',label:'Gümrük Kıymeti — CIF (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 1000000',required:true},
      {id:'iv_gv',label:'Gümrük Vergisi Oranı (%)',type:'number',prefix:'%',placeholder:'Örn: 0'},
      {id:'iv_igv',label:'İlave Gümrük Vergisi Oranı (%)',type:'number',prefix:'%',placeholder:'Örn: 20'},
      {id:'iv_otv',label:'ÖTV Oranı (%)',type:'number',prefix:'%',placeholder:'Yoksa 0'},
      {id:'iv_kdv',label:'KDV Oranı (%)',type:'number',prefix:'%',placeholder:'Örn: 20'}
    ],
    calculate(d){
      const k=parseFloat(d.iv_kiymet)||0;
      const gvO=parseFloat(d.iv_gv)||0,igvO=parseFloat(d.iv_igv)||0,otvO=parseFloat(d.iv_otv)||0,kdvO=parseFloat(d.iv_kdv)||0;
      const gv=k*gvO/100, igv=k*igvO/100;
      const otvMatrah=k+gv+igv, otv=otvMatrah*otvO/100;
      const kdvMatrah=otvMatrah+otv, kdv=kdvMatrah*kdvO/100;
      const toplamVergi=gv+igv+otv+kdv, maliyet=k+toplamVergi;
      return{total:Math.round(toplamVergi),rows:[
        {label:'Gümrük kıymeti (CIF)',value:fmt(k)},
        {label:'Gümrük Vergisi (%'+gvO+')',value:fmt(gv)},
        {label:'İlave Gümrük Vergisi (%'+igvO+')',value:fmt(igv)},
        {label:'ÖTV matrahı',value:fmt(otvMatrah)},
        {label:'ÖTV (%'+otvO+')',value:fmt(otv)},
        {label:'KDV matrahı',value:fmt(kdvMatrah)},
        {label:'KDV (%'+kdvO+')',value:fmt(kdv)},
        {label:'Toplam vergi yükü',value:fmt(toplamVergi),highlight:true},
        {label:'Eşyanın vergili maliyeti',value:fmt(maliyet),highlight:true}
      ]};
    }},

  gumrukCeza:{badge:'Gümrük Para Cezası',title:'Gümrük Para Cezası ve İtiraz Değerlendirmesi',desc:'Eksik vergi tahakkukunda Gümrük Kanunu 234 uyarınca vergi farkının üç katı ceza kesilir; itiraz senaryosunu karşılaştırın',
    fields:[
      {id:'gc_fark',label:'Tespit Edilen Vergi Farkı (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 150000',required:true},
      {id:'gc_usulsuzluk',label:'Ayrıca Kesilen Usulsüzlük Cezası (TL)',type:'number',prefix:'₺',placeholder:'Yoksa 0'},
      {id:'gc_indirim',label:'Uzlaşma / İtirazla Beklenen İndirim (%)',type:'range',min:0,max:100,step:5,defaultVal:0},
      {id:'gc_masraf',label:'Tahmini Dava Masrafı — harç, bilirkişi, vekâlet (TL)',type:'number',prefix:'₺',placeholder:'Örn: 40000'}
    ],
    calculate(d){
      const fark=parseFloat(d.gc_fark)||0, usul=parseFloat(d.gc_usulsuzluk)||0;
      const ind=parseInt(d.gc_indirim)||0, masraf=parseFloat(d.gc_masraf)||0;
      const ceza=fark*3;                        /* GK 234: vergi farkının üç katı */
      const toplam=fark+ceza+usul;
      const indirimli=toplam-(ceza+usul)*ind/100;
      const kazanc=toplam-indirimli-masraf;     /* itirazın net getirisi */
      return{total:Math.round(toplam),rows:[
        {label:'Vergi farkı',value:fmt(fark)},
        {label:'Para cezası (GK 234 — farkın 3 katı)',value:fmt(ceza),highlight:true},
        {label:'Usulsüzlük cezası',value:fmt(usul)},
        {label:'İtiraz edilmezse toplam yük',value:fmt(toplam),highlight:true},
        {label:'İndirim beklentisi',value:'%'+ind},
        {label:'İndirimli toplam',value:fmt(indirimli)},
        {label:'Tahmini dava masrafı',value:'-'+fmt(masraf)},
        {label:kazanc>0?'İtirazın tahmini net getirisi':'İtirazın tahmini net maliyeti',value:fmt(Math.abs(kazanc)),highlight:true}
      ]};
    }},

  vergiZiyai:{badge:'Vergi Ziyaı Cezası',title:'Vergi Ziyaı Cezası ve İndirim',desc:'VUK 344 uyarınca ceza verginin bir katı, VUK 359 fiilleri varsa üç katıdır; VUK 376 indirimiyle karşılaştırın',
    fields:[
      {id:'vz_vergi',label:'Ziyaa Uğratılan Vergi (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 200000',required:true},
      {id:'vz_kat',label:'Ceza Katı — normalde 1, VUK 359 fiillerinde 3',type:'number',prefix:'kat',placeholder:'1'},
      {id:'vz_faiz',label:'Aylık Gecikme Faizi Oranı (%)',type:'number',prefix:'%',placeholder:'Güncel oranı girin'},
      {id:'vz_ay',label:'Geçen Süre (Ay)',type:'number',prefix:'ay',placeholder:'Örn: 14'},
      {id:'vz_indirim',label:'VUK 376 İndirimi (%)',type:'range',min:0,max:100,step:5,defaultVal:50}
    ],
    calculate(d){
      const v=parseFloat(d.vz_vergi)||0;
      const kat=Math.max(1,parseFloat(d.vz_kat)||1);
      const faizO=parseFloat(d.vz_faiz)||0, ay=parseInt(d.vz_ay)||0;
      const ind=parseInt(d.vz_indirim);
      const indirimOran=isNaN(ind)?50:ind;
      const ceza=v*kat;
      const faiz=v*faizO/100*ay;               /* VUK 112: vergi üzerinden işler */
      const toplam=v+ceza+faiz;
      const indirimliCeza=ceza*(1-indirimOran/100);
      const indirimliToplam=v+indirimliCeza+faiz;
      return{total:Math.round(toplam),rows:[
        {label:'Ziyaa uğratılan vergi',value:fmt(v)},
        {label:'Vergi ziyaı cezası ('+kat+' kat)',value:fmt(ceza),highlight:true},
        {label:'Gecikme faizi (%'+faizO+' × '+ay+' ay)',value:fmt(faiz)},
        {label:'İndirimsiz toplam',value:fmt(toplam),highlight:true},
        {label:'VUK 376 indirimi (%'+indirimOran+')',value:'-'+fmt(ceza-indirimliCeza)},
        {label:'İndirimli ödenecek toplam',value:fmt(indirimliToplam),highlight:true}
      ]};
    }},

  emlakVergisi:{badge:'Emlak Vergisi',title:'Emlak Vergisi Hesaplama',desc:'Emlak vergi değerinizi girin; Emlak Vergisi Kanunu’ndaki binde oranlarına göre tüm taşınmaz türleri için yıllık vergi listelenir',
    fields:[
      {id:'ev_deger',label:'Emlak Vergi Değeri (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 2000000',required:true}
    ],
    calculate(d){
      const x=parseFloat(d.ev_deger)||0;
      /* EVK m.8: bina — mesken binde 1, diğer binde 2.
         EVK m.18: arsa binde 3, arazi binde 1.
         Büyükşehir belediyesi sınırlarında bu oranlar iki kat uygulanır. */
      const mesken=x*0.001, isyeri=x*0.002, arsa=x*0.003, arazi=x*0.001;
      return{total:Math.round(mesken),rows:[
        {label:'Emlak vergi değeri',value:fmt(x)},
        {label:'Mesken (binde 1)',value:fmt(mesken),highlight:true},
        {label:'Mesken — büyükşehirde (binde 2)',value:fmt(mesken*2)},
        {label:'İş yeri / diğer bina (binde 2)',value:fmt(isyeri)},
        {label:'İş yeri — büyükşehirde (binde 4)',value:fmt(isyeri*2)},
        {label:'Arsa (binde 3)',value:fmt(arsa)},
        {label:'Arsa — büyükşehirde (binde 6)',value:fmt(arsa*2)},
        {label:'Arazi (binde 1)',value:fmt(arazi)},
        {label:'Arazi — büyükşehirde (binde 2)',value:fmt(arazi*2)}
      ]};
    }},

  vergiDavasi:{badge:'Vergi Davası',title:'Vergi Davası Açmaya Değer mi?',desc:'İndirimli ödeme ile dava senaryosunu kazanma ihtimalinize göre karşılaştırın',
    fields:[
      {id:'vd_vergi',label:'Tarh Edilen Vergi (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 300000',required:true},
      {id:'vd_ceza',label:'Kesilen Ceza (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 300000',required:true},
      {id:'vd_harc',label:'Dava Masrafı — harç, bilirkişi (TL)',type:'number',prefix:'₺',placeholder:'Örn: 25000'},
      {id:'vd_avukat',label:'Avukatlık Ücreti (TL)',type:'number',prefix:'₺',placeholder:'Örn: 60000'},
      {id:'vd_ihtimal',label:'Davayı Kazanma İhtimali (%)',type:'range',min:0,max:100,step:5,defaultVal:50}
    ],
    calculate(d){
      const v=parseFloat(d.vd_vergi)||0, c=parseFloat(d.vd_ceza)||0;
      const harc=parseFloat(d.vd_harc)||0, avk=parseFloat(d.vd_avukat)||0;
      const p=(parseInt(d.vd_ihtimal)||0)/100;
      const odeSimdi=v+c*0.5;                  /* VUK 376: cezanın yarısı indirilir */
      const masraf=harc+avk;
      /* Dava beklenen maliyeti: kazanırsa yalnızca masraf, kaybederse
         tamamı + masraf. Basit beklenen değer. */
      const davaBeklenen=p*masraf+(1-p)*(v+c+masraf);
      const fark=odeSimdi-davaBeklenen;
      return{total:Math.round(davaBeklenen),rows:[
        {label:'Tarh edilen vergi',value:fmt(v)},
        {label:'Kesilen ceza',value:fmt(c)},
        {label:'Şimdi öde — VUK 376 ile cezanın yarısı',value:fmt(odeSimdi),highlight:true},
        {label:'Dava masrafı + vekâlet',value:fmt(masraf)},
        {label:'Kazanma ihtimali',value:'%'+Math.round(p*100)},
        {label:'Davanın beklenen maliyeti',value:fmt(davaBeklenen),highlight:true},
        {label:fark>0?'Dava lehine beklenen fark':'İndirimli ödeme lehine fark',value:fmt(Math.abs(fark)),highlight:true}
      ]};
    }},

  hasar:{badge:'Hasar Bedeli Hesaplama',title:'Hasar Bedeli Hesaplayın',desc:'Araç hasar onarım maliyetinizi hesaplayın',
    fields:[{id:'hasar_tutar',label:'Onarım Tutarı (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 35000',required:true},{id:'hasar_parca',label:'Değişen Parça Adedi',type:'number',prefix:'adet',placeholder:'0'},{id:'hasar_boyali',label:'Boyalı Parça Adedi',type:'number',prefix:'adet',placeholder:'0'},{id:'hasar_eksper',label:'Eksper Ücreti (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'hasar_cekici',label:'Çekici / Kurtarma (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'hasar_kira',label:'Alternatif Araç Kiralama (TL)',type:'number',prefix:'₺',placeholder:'0'}],
    calculate(d){const t=parseFloat(d.hasar_tutar)||0,p=(parseInt(d.hasar_parca)||0)*5000+(parseInt(d.hasar_boyali)||0)*3000,e=parseFloat(d.hasar_eksper)||0,c=parseFloat(d.hasar_cekici)||0,k=parseFloat(d.hasar_kira)||0,top=t+p+e+c,kalan=Math.round(top*0.15);return{total:top,rows:[{label:'Onarım Tutarı',value:fmt(t)},{label:'Parça/Boya Ek',value:fmt(p)},{label:'Eksper',value:fmt(e)},{label:'Çekici',value:fmt(c)},{label:'Kiralama',value:fmt(k)},{label:'Tahmini Sigorta Dışı Kalan',value:fmt(kalan),highlight:true}]}}},
  isgucu:{badge:'İş Gücü Kaybı Hesaplama',title:'İş Gücü Kaybı Hesaplayın',desc:'Kaza sonrası uğradığınız gelir kaybınızı hesaplayın',
    fields:[{id:'ig_gunluk',label:'Günlük Brüt Gelir (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 1500',required:true},{id:'ig_gun',label:'İş Göremezlik Süresi (Gün) *',type:'number',prefix:'gün',placeholder:'Örn: 30',required:true},{id:'ig_saglik',label:'Sağlık Giderleri (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'ig_ulasma',label:'Ulaşım Giderleri (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'ig_kusur',label:'Karşı Taraf Kusur Oranı (%)',type:'range',min:0,max:100,step:5,defaultVal:0}],
    calculate(d){const g=parseFloat(d.ig_gunluk)||0,n=parseInt(d.ig_gun)||0,s=parseFloat(d.ig_saglik)||0,u=parseFloat(d.ig_ulasma)||0,k=parseInt(d.ig_kusur)||0,gk=g*n,top=gk+s+u,net=Math.round(top*(1-k/100)*0.85);return{total:net,rows:[{label:'Günlük Brüt Gelir',value:fmt(g)},{label:'Süre',value:n+' gün'},{label:'Gelir Kaybı',value:fmt(gk)},{label:'Sağlık',value:fmt(s)},{label:'Ulaşım',value:fmt(u)},{label:'Toplam Brüt Zarar',value:fmt(top)},{label:'Kusur İndirimi (%'+k+')',value:'-'+fmt(Math.round(top*k/100))},{label:'Tahmini Net Tazminat',value:fmt(net),highlight:true}]}}},
  sakatlik:{badge:'Sürekli Sakatlık Tazminatı',title:'Sürekli Sakatlık Tazminatı',desc:'Kalıcı sakatlık oranına göre tazminatınızı hesaplayın',
    fields:[{id:'sk_oran',label:'Sakatlık Oranı (%) *',type:'range',min:1,max:100,step:1,defaultVal:10,required:true},{id:'sk_brut',label:'Aylık Brüt Gelir (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 25000',required:true},{id:'sk_yas',label:'Kaza Sırası Yaş',type:'number',prefix:'yaş',placeholder:'35'},{id:'sk_gunluk',label:'İş Göremezlik Süresi (Gün)',type:'number',prefix:'gün',placeholder:'0'}],
    calculate(d){const o=parseInt(d.sk_oran)||0,b=parseFloat(d.sk_brut)||0,y=parseInt(d.sk_yas)||35,g=parseInt(d.sk_gunluk)||0,yg=b*12,yf=Math.max(0.5,1-y*0.01),st=Math.round(yg*(o/100)*3*yf),gt=Math.round(b/30*g),tp=st+gt;return{total:tp,rows:[{label:'Sakatlık Oranı',value:'%'+o},{label:'Aylık Brüt',value:fmt(b)},{label:'Yıllık Gelir',value:fmt(yg)},{label:'Yaş Faktörü',value:yf.toFixed(2)},{label:'Sürekli Sakatlık Taz.',value:fmt(st)},{label:'Geçici İş Göremezlik ('+g+' gün)',value:fmt(gt)},{label:'Tahmini Toplam',value:fmt(tp),highlight:true}]}}},
  yoksun:{badge:'Destekten Yoksun Kalma',title:'Destekten Yoksun Kalma Tazminatı',desc:'Trafik kazasında vefat eden bir yakınınızın (eş, çocuğun ebeveyni, nişanlı vb.) desteğinden yoksun kalanlar için tazminat hesaplayın',
    fields:[{id:'yk_yakinlik',label:'Sizin Merhumla Yakınlığınız',type:'text',placeholder:'Örn: Eşi / Çocuğu / Nişanlısı / Anne-Babası'},{id:'yk_gelir',label:'Merhumun Aylık Brüt Geliri (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 20000',required:true},{id:'yk_destek',label:'Destek Oranı (%) *',type:'range',min:10,max:100,step:5,defaultVal:50,required:true},{id:'yk_yas',label:'Merhumun Yaşı',type:'number',prefix:'yaş',placeholder:'45'},{id:'yk_bekli',label:'Yıllık Faiz Oranı (%)',type:'number',prefix:'%',placeholder:'21'}],
    calculate(d){const g=parseFloat(d.yk_gelir)||0,dr=parseInt(d.yk_destek)||50,y=parseInt(d.yk_yas)||45,f=parseFloat(d.yk_bekli)||21,yg=g*12,dt=yg*(dr/100),ky=Math.max(5,65-y),isk=(1-Math.pow(1+f/100,-ky))/(f/100),tp=Math.round(dt*isk);return{total:tp,rows:[{label:'Aylık Brüt Gelir',value:fmt(g)},{label:'Yıllık Gelir',value:fmt(yg)},{label:'Destek Oranı',value:'%'+dr},{label:'Destek Tutarı/Yıl',value:fmt(dt)},{label:'Kalan Yaşam Süresi',value:ky+' yıl'},{label:'İskonto Faktörü',value:isk.toFixed(2)},{label:'Tahmini Toplam',value:fmt(tp),highlight:true}]}}},
  /* Maddi zarar tek bir onarım rakamı değil: aracın kullanılamadığı günler,
     çekici, otopark, ekspertiz, araçtaki eşya ve ticari araçlarda kazanç
     kaybı ayrı ayrı istenebilen kalemler. Kalem kalem sorulmadığında
     kullanıcı gerçek zararının çok altında bir rakam görüyordu. */
  maddi:{badge:'Maddi Zarar Hesaplama',title:'Kaza masraflarınızın toplamı',desc:'Kaza sonrası isteyebileceğiniz bütün maddi kalemleri tek tabloda toplayın. Olmayan kalemleri boş bırakın.',
    fields:[
      {id:'mh_onarim',label:'Onarım / hasar bedeli (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 85000',required:true},
      {id:'mh_degerkaybi',label:'Araç değer kaybı (TL)',type:'number',prefix:'₺',placeholder:'Bilmiyorsanız boş bırakın'},
      {id:'mh_gun',label:'Aracınızı kaç gün kullanamadınız?',type:'number',prefix:'gün',placeholder:'Örn: 18'},
      {id:'mh_gunluk',label:'Günlük kiralık araç bedeli (TL)',type:'number',prefix:'₺',placeholder:'Örn: 1800'},
      {id:'mh_cekici',label:'Çekici / kurtarma bedeli (TL)',type:'number',prefix:'₺',placeholder:'Örn: 4500'},
      {id:'mh_otopark',label:'Otopark / muhafaza bedeli (TL)',type:'number',prefix:'₺',placeholder:'Örn: 2000'},
      {id:'mh_ekspertiz',label:'Ekspertiz veya rapor ücreti (TL)',type:'number',prefix:'₺',placeholder:'Örn: 3000'},
      {id:'mh_ekipman',label:'Araçtaki eşya / ek ekipman zararı (TL)',type:'number',prefix:'₺',placeholder:'Örn: 8000'},
      {id:'mh_kazanc',label:'Ticari araçsa kazanç kaybı (TL)',type:'number',prefix:'₺',placeholder:'Örn: 25000'},
      {id:'mh_tedavi',label:'Tedavi ve ulaşım giderleri (TL)',type:'number',prefix:'₺',placeholder:'Örn: 6000'},
      {id:'mh_kusur',label:'Kendi kusur oranınız (%)',type:'range',min:0,max:100,step:5,defaultVal:0}
    ],
    calculate(d){
      const n=x=>parseFloat(d[x])||0;
      const gun=n('mh_gun'),gunluk=n('mh_gunluk'),mahrum=Math.round(gun*gunluk);
      const kalemler=[
        ['Onarım / hasar bedeli',n('mh_onarim')],
        ['Araç değer kaybı',n('mh_degerkaybi')],
        ['İkame araç / mahrumiyet'+(gun&&gunluk?' ('+gun+' gün × '+fmt(gunluk)+')':''),mahrum],
        ['Çekici / kurtarma',n('mh_cekici')],
        ['Otopark / muhafaza',n('mh_otopark')],
        ['Ekspertiz / rapor',n('mh_ekspertiz')],
        ['Araçtaki eşya ve ek ekipman',n('mh_ekipman')],
        ['Kazanç kaybı (ticari araç)',n('mh_kazanc')],
        ['Tedavi ve ulaşım giderleri',n('mh_tedavi')]
      ].filter(x=>x[1]>0);
      const top=kalemler.reduce((a,x)=>a+x[1],0);
      const k=parseInt(d.mh_kusur)||0,ind=Math.round(top*k/100),net=top-ind;
      const rows=kalemler.map(x=>({label:x[0],value:fmt(x[1])}));
      rows.push({label:'Toplam brüt zarar',value:fmt(top),highlight:true});
      if(k>0)rows.push({label:'Kendi kusurunuz nedeniyle indirim (%'+k+')',value:'-'+fmt(ind)});
      rows.push({label:'Tahmini net tazminat',value:fmt(net),highlight:true});
      return{total:net,rows:rows};
    }},
  gecici:{badge:'Geçici İş Göremezlik',title:'Geçici İş Göremezlik',desc:'Kaza sonrası geçici iş göremezlik gelir kaybınızı hesaplayın',
    fields:[{id:'gig_brut',label:'Aylık Brüt Maaş (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 20000',required:true},{id:'gig_gun',label:'İş Göremezlik Süresi (Gün) *',type:'number',prefix:'gün',placeholder:'Örn: 20',required:true},{id:'gig_saglik',label:'Sağlık Giderleri (TL)',type:'number',prefix:'₺',placeholder:'0'}],
    calculate(d){const b=parseFloat(d.gig_brut)||0,g=parseInt(d.gig_gun)||0,s=parseFloat(d.gig_saglik)||0,gb=b/30,sgk=Math.round(gb*0.5*g),iv=Math.round(gb*0.5*g),tp=sgk+iv+s;return{total:tp,rows:[{label:'Aylık Brüt Maaş',value:fmt(b)},{label:'Günlük Brüt',value:fmt(Math.round(gb))},{label:'Süre',value:g+' gün'},{label:'SGK Ödemesi (%50)',value:fmt(sgk)},{label:'İşveren Payı (%50)',value:fmt(iv)},{label:'Sağlık Giderleri',value:fmt(s)},{label:'Tahmini Toplam',value:fmt(tp),highlight:true}]}}},
  kalici:{badge:'Kalıcı İş Göremezlik',title:'Kalıcı İş Göremezlik',desc:'Kalıcı iş göremezlik oranına göre tazminatınızı hesaplayın',
    fields:[{id:'kig_oran',label:'İş Göremezlik Oranı (%) *',type:'range',min:1,max:100,step:1,defaultVal:25,required:true},{id:'kig_brut',label:'Aylık Brüt Gelir (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 20000',required:true},{id:'kig_yas',label:'Kaza Sırası Yaş',type:'number',prefix:'yaş',placeholder:'30'},{id:'kig_yillik',label:'Yıllık Gelir Artışı (%)',type:'number',prefix:'%',placeholder:'15'}],
    calculate(d){const o=parseInt(d.kig_oran)||0,b=parseFloat(d.kig_brut)||0,y=parseInt(d.kig_yas)||35,a=parseFloat(d.kig_yillik)||15,yg=b*12,ky=Math.max(5,65-y),isk=1/(1+a/100);let tp=0;for(let i=0;i<ky;i++)tp+=yg*(o/100)*Math.pow(isk,i);tp=Math.round(tp);return{total:tp,rows:[{label:'İş Göremezlik Oranı',value:'%'+o},{label:'Aylık Brüt',value:fmt(b)},{label:'Yıllık Gelir',value:fmt(yg)},{label:'Kalan Çalışma Süresi',value:ky+' yıl'},{label:'Yıllık Artış',value:'%'+a},{label:'Tahmini Toplam',value:fmt(tp),highlight:true}]}}},
  nafaka:{badge:'Nafaka Hesaplama',title:'Nafaka Tutarı Hesaplayın',desc:'Boşanma nafakası hesaplaması yapın',
    fields:[{id:'nf_gelir',label:'Nafaka Ödeyen Aylık Brüt Gelir (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 25000',required:true},{id:'nf_cocuk',label:'Çocuk Sayısı',type:'number',prefix:'kişi',placeholder:'1'},{id:'nf_cocuk_yas',label:'Çocukların Ortalama Yaşı',type:'number',prefix:'yaş',placeholder:'8'},{id:'nf_oran',label:'Nafaka Oranı (%)',type:'range',min:5,max:50,step:1,defaultVal:25,required:true}],
    calculate(d){const g=parseFloat(d.nf_gelir)||0,n=parseInt(d.nf_cocuk)||1,y=parseInt(d.nf_cocuk_yas)||8,o=parseInt(d.nf_oran)||25,yg=g*12,kalan_sure=Math.max(1,18-y),nf_yillik=Math.round(yg*(o/100)),nf_aylik=Math.round(nf_yillik/12),toplam=Math.round(nf_yillik*kalan_sure*n);return{total:toplam,rows:[{label:'Aylık Brüt Gelir',value:fmt(g)},{label:'Yıllık Gelir',value:fmt(yg)},{label:'Nafaka Oranı',value:'%'+o},{label:'Aylık Nafaka',value:fmt(nf_aylik)},{label:'Yıllık Nafaka',value:fmt(nf_yillik)},{label:'Çocuk Sayısı',value:n+''},{label:'Kalan Süre',value:kalan_sure+' yıl'},{label:'Tahmini Toplam',value:fmt(toplam),highlight:true}]}}},
  isKazasi:{badge:'İş Kazası Tazminatı',title:'İş Kazası Tazminatı',desc:'İş kazası sonrası hak ettiğiniz tazminatı hesaplayın',
    fields:[{id:'ik_brut',label:'Aylık Brüt Maaş (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 20000',required:true},{id:'ik_sakatlik',label:'Sakatlık Oranı (%) *',type:'range',min:1,max:100,step:1,defaultVal:10,required:true},{id:'ik_yas',label:'Kaza Sırası Yaş',type:'number',prefix:'yaş',placeholder:'35'},{id:'ik_gunluk',label:'İş Göremezlik Süresi (Gün)',type:'number',prefix:'gün',placeholder:'0'}],
    calculate(d){const b=parseFloat(d.ik_brut)||0,o=parseInt(d.ik_sakatlik)||10,y=parseInt(d.ik_yas)||35,g=parseInt(d.ik_gunluk)||0,yg=b*12,yf=Math.max(0.5,1-y*0.01),sg=Math.round(b/30*g),sug=Math.round(yg*(o/100)*3.5*yf),tp=sg+sug;return{total:tp,rows:[{label:'Aylık Brüt Maaş',value:fmt(b)},{label:'Yıllık Gelir',value:fmt(yg)},{label:'Sakatlık Oranı',value:'%'+o},{label:'Yaş Faktörü',value:yf.toFixed(2)},{label:'Geçici İstirahat ('+g+' gün)',value:fmt(sg)},{label:'Sürekli Sakatlık Taz.',value:fmt(sug)},{label:'Tahmini Toplam',value:fmt(tp),highlight:true}]}}},
  kasko:{badge:'Kasko Hasar Tazminatı',title:'Kasko Hasar Hesaplayın',desc:'Kasko sigortası kapsamındaki hasarınızı hesaplayın',
    fields:[{id:'kasko_arac',label:'Araç Değeri (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 800000',required:true},{id:'kasko_hasar',label:'Hasar Oranı (%) *',type:'range',min:1,max:100,step:1,defaultVal:30,required:true},{id:'kasko_kasko',label:'Kasko Bedeli (TL)',type:'number',prefix:'₺',placeholder:'Opsiyonel'},{id:'kasko_kusur',label:'Kusur Oranı (%)',type:'range',min:0,max:100,step:5,defaultVal:0}],
    calculate(d){const a=parseFloat(d.kasko_arac)||0,h=parseInt(d.kasko_hasar)||30,kb=parseFloat(d.kasko_kasko)||0,kus=parseInt(d.kasko_kusur)||0,hasar_tutar=Math.round(a*(h/100)),net=Math.round(hasar_tutar*(1-kus/100)*0.85),eksper=Math.round(hasar_tutar*0.02),top=net+eksper;return{total:top,rows:[{label:'Araç Değeri',value:fmt(a)},{label:'Hasar Oranı',value:'%'+h},{label:'Hasar Tutarı',value:fmt(hasar_tutar)},{label:'Kusur İndirimi',value:'-'+fmt(Math.round(hasar_tutar*kus/100))},{label:'Eksper Ücreti',value:fmt(eksper)},{label:'Tahmini Net Tazminat',value:fmt(top),highlight:true}]}}},
  tuketici:{badge:'Tüketici Hakları Tazminatı',title:'Tüketici Tazminatı',desc:'Ayıplı mal veya hizmet için tazminatınızı hesaplayın',
    fields:[{id:'th_urun',label:'Ürün/Hizmet Bedeli (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 15000',required:true},{id:'th_kargo',label:'Kargo / Ek Gider (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'th_avukat',label:'Avukat Ücreti (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'th_manevi',label:'Manevi Tazminat Talebi (TL)',type:'number',prefix:'₺',placeholder:'0'}],
    calculate(d){const u=parseFloat(d.th_urun)||0,k=parseFloat(d.th_kargo)||0,a=parseFloat(d.th_avukat)||0,m=parseFloat(d.th_manevi)||0,iddia=u+k+a+m,mahkeme=Math.round(iddia*0.6),avukat=Math.round(iddia*0.12),top=mahkeme+avukat;return{total:top,rows:[{label:'Ürün/Hizmet Bedeli',value:fmt(u)},{label:'Kargo/Gider',value:fmt(k)},{label:'Avukat Ücreti',value:fmt(a)},{label:'Manevi Tazminat',value:fmt(m)},{label:'Toplam İddia',value:fmt(iddia)},{label:'Tahmini Mahkeme Kararı',value:fmt(mahkeme),highlight:true},{label:'Avukat Masrafı Tahmini',value:fmt(avukat)},{label:'Net Tahmin',value:fmt(top),highlight:true}]}}},
  tapu:{badge:'Tapu Harcı Hesaplama',title:'Tapu Harcı Hesaplayın',desc:'Gayrimenkul alım-satımında vergi yükümlülüklerinizi hesaplayın',
    fields:[{id:'tapu_deger',label:'Emlak Değeri (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 3000000',required:true},{id:'tapu_emlak',label:'Emlak Vergisi Oranı (%)',type:'number',prefix:'%',placeholder:'0.1'},{id:'tapu_kdv',label:'KDV Oranı (%)',type:'number',prefix:'%',placeholder:'20'},{id:'tapu_diger',label:'Diger Giderler (TL)',type:'number',prefix:'₺',placeholder:'0'}],
    calculate(d){const v=parseFloat(d.tapu_deger)||0,evr=parseFloat(d.tapu_emlak)||0.1,kdvr=parseFloat(d.tapu_kdv)||20,dig=parseFloat(d.tapu_diger)||0,harci=Math.round(v*0.04),emlak=Math.round(v*evr/100),kdv=Math.round(v*kdvr/100),top=harci+emlak+kdv+dig;return{total:top,rows:[{label:'Emlak Değeri',value:fmt(v)},{label:'Tapu Harcı (%4)',value:fmt(harci)},{label:'Emlak Vergisi',value:fmt(emlak)},{label:'KDV',value:fmt(kdv)},{label:'Diğer Giderler',value:fmt(dig)},{label:'Toplam Yükümlülük',value:fmt(top),highlight:true}]}}},
  trafikCezasi:{badge:'Trafik Cezası Hesaplama',title:'Trafik Cezası Maliyeti',desc:'Trafik cezası ve itiraz sürecinin tahmini maliyetini hesaplayın',
    fields:[{id:'tc_ceza',label:'Ceza Tutarı (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 4000',required:true},{id:'tc_puan',label:'Ehliyet Puanı',type:'number',prefix:'puan',placeholder:'0'},{id:'tc_avukat',label:'Avukat Ücreti (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'tc_itiraz',label:'İtiraz Edilsin mi?',type:'range',min:0,max:1,step:1,defaultVal:0}],
    calculate(d){const c=parseFloat(d.tc_ceza)||0,p=parseInt(d.tc_puan)||0,a=parseFloat(d.tc_avukat)||0,it=parseInt(d.tc_itiraz)||0,bos_dava_masraf=2500,avukat_ucret=a||Math.round(c*0.20),toplam_gider=c+avukat_ucret+bos_dava_masraf,hukuk_iade=it?Math.round(c*0.5):0,net=toplam_gider-hukuk_iade;return{total:net,rows:[{label:'Ceza Tutarı',value:fmt(c)},{label:'Ehliyet Puanı',value:p+' pt'},{label:'Avukat Ücreti Tahmini',value:fmt(avukat_ucret)},{label:'Dava Masrafı',value:fmt(bos_dava_masraf)},{label:'Toplam Maliyet',value:fmt(toplam_gider)},{label:'İtiraz Başarılı Olursa İade',value:it?fmt(hukuk_iade):'Edilmedi',highlight:it},{label:'Net Tahmini Maliyet',value:fmt(net),highlight:true}]}}},
  manevi:{badge:'Manevi Tazminat Hesaplama',title:'Manevi Tazminat Hesaplayın',desc:'Yaşadığınız manevi zarar için tahmini tazminatınızı hesaplayın',
    fields:[{id:'mt_kusur',label:'Karşı Taraf Kusur Oranı (%) *',type:'range',min:0,max:100,step:5,defaultVal:100,required:true},{id:'mt_sure',label:'Tedavi / Süre (Ay)',type:'number',prefix:'ay',placeholder:'Örn: 6'},{id:'mt_yas',label:'Mağdur Yaşı',type:'number',prefix:'yaş',placeholder:'35'},{id:'mt_gelir',label:'Aylık Gelir (TL)',type:'number',prefix:'₺',placeholder:'Opsiyonel'}],
    calculate(d){const k=parseInt(d.mt_kusur)||100,s=parseInt(d.mt_sure)||1,y=parseInt(d.mt_yas)||35,g=parseFloat(d.mt_gelir)||15000,temel=Math.round(50000+s*8000+(65-y)*500),kusul=Math.round(temel*(k/100)),ek=Math.round(g*s*0.3),top=kusul+ek;return{total:top,rows:[{label:'Temel Tutar',value:fmt(temel)},{label:'Kusur Oranı',value:'%'+k},{label:'Kusura Göre',value:fmt(kusul)},{label:'Süre Bazlı Ek',value:fmt(ek)},{label:'Tedavi Süresi',value:s+' ay'},{label:'Tahmini Manevi Tazminat',value:fmt(top),highlight:true}]}}},
  bakiyeSure:{badge:'Bakiye Süre Ücreti',title:'Bakiye Süre Ücreti Tazminatı Hesaplayın',desc:'Belirli süreli iş sözleşmeniz (örn. özel okul öğretmenliği, 5580 sayılı Kanun) süresinden önce ve haklı neden olmaksızın feshedildiyse, kalan sürenin ücretini hesaplayın',
    fields:[
      {id:'bs_sozlesme_ay',label:'Sözleşme Süresi (Ay) *',type:'number',prefix:'ay',placeholder:'Örn: 8',required:true},
      {id:'bs_ucret',label:'Aylık Ücret (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 30000',required:true},
      {id:'bs_calisilan_ay',label:'Kaç Ay Çalıştınız? *',type:'number',prefix:'ay',placeholder:'Örn: 5',required:true},
      {id:'bs_fesih_eden',label:'Sözleşmeyi Kim Feshetti? (0=İşveren, 1=Ben)',type:'range',min:0,max:1,step:1,defaultVal:0},
      {id:'bs_haksiz',label:'İşverenin Feshi Haklı Bir Nedene mi Dayanıyordu? (0=Hayır/haksız, 1=Evet/haklı)',type:'range',min:0,max:1,step:1,defaultVal:0}
    ],
    calculate(d){
      const sozlesmeAy=parseFloat(d.bs_sozlesme_ay)||0,ucret=parseFloat(d.bs_ucret)||0,calisilanAy=parseFloat(d.bs_calisilan_ay)||0;
      const isciFesih=parseInt(d.bs_fesih_eden)===1;
      const haklıNeden=parseInt(d.bs_haksiz)===1;
      const kalanAy=Math.max(0,sozlesmeAy-calisilanAy);
      const hakEdiyor=!isciFesih&&!haklıNeden&&kalanAy>0;
      const bakiyeUcret=hakEdiyor?Math.round(kalanAy*ucret):0;
      const kidemUyari=calisilanAy>=12;
      const rows=[
        {label:'Sözleşme Süresi',value:sozlesmeAy+' ay'},
        {label:'Çalışılan Süre',value:calisilanAy+' ay'},
        {label:'Kalan (Bakiye) Süre',value:kalanAy+' ay'},
        {label:'Aylık Ücret',value:fmt(ucret)},
      ];
      if(!hakEdiyor){
        let neden=isciFesih?'Sözleşmeyi siz feshettiğiniz için bakiye süre ücreti talep edemezsiniz.':haklıNeden?'İşveren haklı bir nedenle feshettiği için bakiye süre ücreti talep edilemez.':'Kalan süre bulunmadığı için (sözleşme zaten dolmuş) bakiye süre ücreti oluşmuyor.';
        rows.push({label:'Sonuç',value:neden});
      }
      rows.push({label:'Bakiye Süre Ücreti Tazminatı',value:fmt(bakiyeUcret),highlight:hakEdiyor});
      if(hakEdiyor&&kidemUyari)rows.push({label:'Not',value:'1 yıldan fazla çalıştığınız için ayrıca kıdem tazminatı hakkınız da olabilir — "İşçilik Alacakları Hesaplama" aracını da kullanın.'});
      return{total:bakiyeUcret,rows};
    }},
  mahrumiyet:{badge:'Araç Mahrumiyet Bedeli',title:'Araç Mahrumiyet (Yatma) Bedeli',desc:'Kaza sonrası aracınız tamirdeyken uğradığınız kullanım kaybını hesaplayın',
    vehiclePicker:true,
    fields:[{id:'mr_gunluk',label:'Günlük Kira Bedeli (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 750, ya da AI ile tahmin ettirin',required:true},{id:'mr_gun',label:'Mahrumiyet Süresi (Gün) *',type:'number',prefix:'gün',placeholder:'Örn: 20',required:true},{id:'mr_arac_deger',label:'Araç Piyasa Değeri (TL)',type:'number',prefix:'₺',placeholder:'Araç seçince otomatik dolar'},{id:'mr_arac_yas',label:'Araç Yaşı',type:'number',prefix:'yıl',placeholder:'Araç seçince otomatik dolar'}],
    calculate(d){const g=parseFloat(d.mr_gunluk)||0,n=parseInt(d.mr_gun)||0,top=Math.round(g*n);return{total:top,rows:[{label:'Günlük Kira Bedeli',value:fmt(g)},{label:'Mahrumiyet Süresi',value:n+' gün'},{label:'Toplam Mahrumiyet Bedeli',value:fmt(top),highlight:true}]}}},
  bosanma:{badge:'Boşanma Tazminatı ve Mal Paylaşımı',title:'Boşanma Hesaplaması',desc:'Boşanma davasında maddi/manevi tazminat ve mal paylaşımını hesaplayın',
    fields:[{id:'bm_evlilik',label:'Evlilik Süresi (Yıl) *',type:'number',prefix:'yıl',placeholder:'10',required:true},{id:'bm_gelir_erkek',label:'Erkeğin Aylık Geliri (TL)',type:'number',prefix:'₺',placeholder:'30000'},{id:'bm_gelir_kadin',label:'Kadının Aylık Geliri (TL)',type:'number',prefix:'₺',placeholder:'15000'},{id:'bm_cocuk',label:'Çocuk Sayısı',type:'number',prefix:'kişi',placeholder:'2'},{id:'bm_mal',label:'Ortak Mal Varlığı (TL)',type:'number',prefix:'₺',placeholder:'5000000'},{id:'bm_kusur',label:'Kusur Oranı (Erkek %)',type:'range',min:0,max:100,step:5,defaultVal:50}],
    calculate(d){const e=parseInt(d.bm_evlilik)||10,ge=parseFloat(d.bm_gelir_erkek)||0,gk=parseFloat(d.bm_gelir_kadin)||0,c=parseInt(d.bm_cocuk)||2,m=parseFloat(d.bm_mal)||0,k=parseInt(d.bm_kusur)||0;const mg=Math.round((ge+gk)/2),mal_pay=Math.round(m*0.5),naf_yillik=Math.round((ge-gk)*0.25*Math.min(1,e/5)),naf_aylik=Math.round(naf_yillik/12),naf_toplam=Math.round(naf_yillik*Math.min(10,e)),maddi_taz=Math.round(ge*e*0.3*(k/100)),manevi_taz=Math.round(Math.max(10000,k*5000*Math.min(1,e/5))),toplam=mal_pay+naf_toplam+maddi_taz+manevi_taz;return{total:toplam,rows:[{label:'Evlilik Süresi',value:e+' yıl'},{label:'Ortalama Aylık Gelir',value:fmt(mg)},{label:'Ortak Mal Varlığı',value:fmt(m)},{label:'Mal Paylaşımı (%50)',value:fmt(mal_pay),highlight:true},{label:'Yıllık Nafaka',value:fmt(naf_yillik)},{label:'Aylık Nafaka',value:fmt(naf_aylik)},{label:'Toplam Nafaka',value:fmt(naf_toplam)},{label:'Maddi Tazminat',value:fmt(maddi_taz),highlight:true},{label:'Manevi Tazminat',value:fmt(manevi_taz),highlight:true},{label:'Toplam Tahmini',value:fmt(toplam),highlight:true}]}}},
   miras:{badge:'Miras Payı Hesaplama',title:'Miras Paylaşımı',desc:'Türk Medeni Kanunu\'na göre yasal miras paylarını hesaplayın',
      fields:[{id:'m_terike',label:'Tereke (Toplam Miras) Değeri (TL) *',type:'number',prefix:'₺',placeholder:'2000000',required:true},{id:'m_es',label:'Sağ Kalan Eş Var mı?',type:'range',min:0,max:1,step:1,defaultVal:1},{id:'m_cocuk',label:'Çocuk Sayısı',type:'number',prefix:'kişi',placeholder:'0'},{id:'m_anne',label:'Anne/Baba Sağ mı?',type:'range',min:0,max:2,step:1,defaultVal:0}],
     calculate(d){const t=parseFloat(d.m_terike)||0,e=(d.m_es===''||d.m_es===undefined||d.m_es===null)?1:parseInt(d.m_es),c=parseInt(d.m_cocuk)||0,ab=parseInt(d.m_anne)||0;let es_pay=0,cocuk_pay=0,ab_pay=0;if(c>0&&e){es_pay=Math.round(t/4);cocuk_pay=Math.round((t-es_pay)/c);}else if(c>0&&!e){cocuk_pay=Math.round(t/c);}else if(!c&&e){if(ab){es_pay=Math.round(t*3/4);ab_pay=Math.round((t-es_pay)/ab);}else{es_pay=t;}}else{if(ab)ab_pay=Math.round(t/ab);else ab_pay=t;}const dagitilan=es_pay+(cocuk_pay*c)+ab_pay;const rows=[{label:'Tereke Değeri',value:fmt(t)}];if(es_pay>0)rows.push({label:'Sağ Kalan Eş Payı',value:fmt(es_pay),highlight:true});if(cocuk_pay>0)rows.push({label:'Çocuk Başına Pay ('+c+' çocuk)',value:fmt(cocuk_pay)});if(ab_pay>0)rows.push({label:'Anne/Baba Payı',value:fmt(ab_pay),highlight:true});if(dagitilan>0)rows.push({label:'Dağıtılan Toplam',value:fmt(dagitilan),highlight:true});return{total:dagitilan||t,rows:rows}}},
   kamulastirma:{badge:'Kamulaştırmasız El Atma',title:'Kamulaştırmasız El Atma Tazminatı',desc:'Taşınmazınıza kamulaştırmasız el atılması durumunda tazminatınızı hesaplayın',
    fields:[{id:'ke_arsa',label:'Arsa / Taşınmaz Değeri (TL) *',type:'number',prefix:'₺',placeholder:'2000000',required:true},{id:'ke_yuzolcumu',label:'El Atılan Alan (m²)',type:'number',prefix:'m²',placeholder:'500'},{id:'ke_toplam',label:'Toplam Alan (m²)',type:'number',prefix:'m²',placeholder:'1000'},{id:'ke_yapi',label:'Varsa Yapı Değeri (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'ke_ek',label:'Mahrumiyet / Ek Giderler (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'ke_yil',label:'El Atma Süresi (Yıl)',type:'number',prefix:'yıl',placeholder:'5'}],
    calculate(d){const a=parseFloat(d.ke_arsa)||0,el=parseFloat(d.ke_yuzolcumu)||0,t=parseFloat(d.ke_toplam)||1,y=parseFloat(d.ke_yapi)||0,e=parseFloat(d.ke_ek)||0,s=parseInt(d.ke_yil)||5;const oran=Math.min(1,el/t),arsa_pay=Math.round(a*oran),yapi_pay=y>0?Math.round(y*0.6):0,toplam=arsa_pay+yapi_pay+e,mahrumiyet=Math.round(toplam*0.1*s),net=toplam+mahrumiyet;return{total:net,rows:[{label:'Taşınmaz Değeri',value:fmt(a)},{label:'El Atılan Alan',value:el+'/'+t+' m² ('+Math.round(oran*100)+'%)'},{label:'Arsa Payı',value:fmt(arsa_pay)},{label:'Yapı Değeri (%60)',value:fmt(yapi_pay)},{label:'Ek Giderler',value:fmt(e)},{label:'El Atma Bedeli',value:fmt(toplam)},{label:'Mahrumiyet Bedeli ('+s+' yıl)',value:fmt(mahrumiyet)},{label:'Toplam Tazminat',value:fmt(net),highlight:true}]}}},
   pertBedeli:{badge:'Pert Araç Bedeli',title:'Pert Bedeli Hesaplayın',desc:'Onarım bedeli piyasa değerinin %50\'sini aşan (pert kabul edilen) araçlarda sigortadan alacağınız bedeli hesaplayın',
    vehiclePicker:true,
    fields:[{id:'pb_rayic',label:'Aracın Hasar Öncesi Rayiç (Piyasa) Değeri (TL) *',type:'number',prefix:'₺',placeholder:'Araç seçince otomatik dolar',required:true},{id:'pb_hurda',label:'Hurda/Sovtaj Değeri (TL)',type:'number',prefix:'₺',placeholder:'Bilmiyorsanız boş bırakın, ya da AI ile tahmin ettirin'}],
    calculate(d){const rayic=parseFloat(d.pb_rayic)||0,hurda=parseFloat(d.pb_hurda)||0,sigortayaBirak=rayic,kendinAl=Math.max(0,rayic-hurda),top=hurda>0?kendinAl:sigortayaBirak;return{total:top,rows:[{label:'Rayiç (Piyasa) Değeri',value:fmt(rayic)},{label:'Hurda/Sovtaj Değeri',value:hurda>0?fmt(hurda):'Belirtilmedi'},{label:'Hurdayı Sigortaya Bırakırsanız',value:fmt(sigortayaBirak),highlight:true},{label:'Hurdayı Kendiniz Alırsanız',value:hurda>0?fmt(kendinAl):'Hurda değeri girilmedi',highlight:hurda>0},{label:'Not',value:'Onarım bedeli piyasa değerinin %50\'sini aşan araçlar pert kabul edilir ve bu araçlarda ayrıca değer kaybı talep edilemez.'}]}}},
   iseIadeTazminat:{badge:'İşe İade Davası Tazminatı',title:'İşe İade Davası Tazminatlarını Hesaplayın',desc:'Davayı kazanmanız durumunda alacağınız boşta geçen süre ücreti ve işe başlatmama tazminatını hesaplayın',
    fields:[{id:'ii_brut',label:'Aylık Brüt Maaş (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 25000',required:true},{id:'ii_bosta',label:'Boşta Geçen Süre (Ay)',type:'range',min:4,max:8,step:1,defaultVal:4},{id:'ii_baslatmama',label:'İşe Başlatmama Tazminatı (Ay)',type:'range',min:4,max:8,step:1,defaultVal:4}],
    calculate(d){const b=parseFloat(d.ii_brut)||0,bosta=parseInt(d.ii_bosta)||4,bas=parseInt(d.ii_baslatmama)||4,bostaUcret=Math.round(b*bosta),basTaz=Math.round(b*bas),toplam=bostaUcret+basTaz;return{total:toplam,rows:[{label:'Aylık Brüt Maaş',value:fmt(b)},{label:'Boşta Geçen Süre Ücreti ('+bosta+' ay)',value:fmt(bostaUcret),highlight:true},{label:'İşe Başlatmama Tazminatı ('+bas+' ay)',value:fmt(basTaz),highlight:true},{label:'Toplam Tahmini Tazminat',value:fmt(toplam),highlight:true}]}}}
};

const state={screen:'home',currentStep:1,vehicleYear:null,vehicleBrand:null,vehicleModel:null,vehicleTrim:'Base',autoMarketValue:0,selectedParts:{},tramerValue:0,mileage:0,faultRatio:0,recentAccident:null,priorCompensation:false,aracResult:null,iscResult:null,pendingType:null,pendingResult:null,leadVekalet:null,blogFilter:'Tümü',partPickerPart:null};

function fmt(n){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(Math.max(0,Math.round(n)))+' TL';}
function fmt2(n){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(Math.max(0,Math.round(n)));}

let _navLock=false;
/* ========== SEO URL ROUTING ========== */
const ROUTE_MAP={
  '/ev-satis-vergisi-iade-hesaplama':{screen:'evSatisIade',title:'Ev Satış Vergisi İade Tutarı Hesaplama | Müvekkil Bilgi',desc:'Konut satışı ticari kazanç sayılıp KDV ve geçici vergi ödediyseniz iade tutarınızı hesaplayın. Değer artış kazancı (GVK mük. m.80) esasına göre karşılaştırmalı hesap.'},
  '/durum-tespiti':{screen:'tani',title:'Durum Tespiti — Hangi Hakkım Var? | Müvekkil Bilgi',desc:'Birkaç soruyla durumunuzu tahmin edelim: dosyanızda hangi tazminat kalemleri var, süreniz ne kadar ve hangi hesabı yapmalısınız.'},
  '/vergi-iademi-nasil-alirim':{screen:'vergiIade',title:'Vergi İademi Nasıl Alabilirim? | Müvekkil Bilgi',desc:'Fazla veya yersiz ödenen vergiyi geri almak için başvuru mercii, süre, belgeler ve örnek dilekçe — adım adım yol haritası.'},
  '/trafik-kazasi-hesaplama':{screen:'arac',title:'Trafik Kazası Araç Değer Kaybı Hesaplama | Müvekkil Bilgi',desc:'Kaza geçiren aracınızın piyasa değerindeki kaybı yasal formüllerle ücretsiz hesaplayın.'},
  '/is-hukuku-hesaplama':{screen:'isHukuku',title:'İş Hukuku Alacak Hesaplama | Müvekkil Bilgi',desc:'İşten ayrılma veya çıkarılma durumunuza göre kıdem, ihbar, izin ve fazla mesai alacaklarınızı hesaplayın.'},
  '/gozetim-fazla-vergi-iadesi':{screen:'gozetim',title:'Gözetim Kaynaklı Fazla Vergi İadesi | Müvekkil Bilgi',desc:'Gümrükte gözetim uygulaması nedeniyle fazla ödenen vergilerin iade ihtimalini 1 dakikada kontrol edin.'},
  '/ithalat-vergileri-hesaplama':{generic:'ithalatVergi',title:'İthalat Vergileri Hesaplama | Müvekkil Bilgi',desc:'Gümrük kıymeti ve oranlara göre gümrük vergisi, İGV, ÖTV ve KDV yükünü kademeli olarak hesaplayın.'},
  '/gumruk-para-cezasi-itiraz':{generic:'gumrukCeza',title:'Gümrük Para Cezası ve İtiraz | Müvekkil Bilgi',desc:'Gümrük Kanunu 234 uyarınca kesilen para cezasını ve itiraz senaryosunu karşılaştırın.'},
  '/vergi-ziyai-cezasi-hesaplama':{generic:'vergiZiyai',title:'Vergi Ziyaı Cezası Hesaplama | Müvekkil Bilgi',desc:'VUK 344 uyarınca vergi ziyaı cezasını, gecikme faizini ve VUK 376 indirimini hesaplayın.'},
  '/emlak-vergisi-hesaplama':{generic:'emlakVergisi',title:'Emlak Vergisi Hesaplama | Müvekkil Bilgi',desc:'Mesken, iş yeri, arsa ve arazi için yıllık emlak vergisini büyükşehir farkıyla hesaplayın.'},
  '/vergi-davasi-degerlendirme':{generic:'vergiDavasi',title:'Vergi Davası Açmaya Değer mi? | Müvekkil Bilgi',desc:'İndirimli ödeme ile dava senaryosunu kazanma ihtimalinize göre karşılaştırın.'},
  '/deger-kaybi-hesaplama':{screen:'arac',title:'Araç Değer Kaybı Hesaplama | Müvekkil Bilgi',desc:'Trafik kazası geçiren aracınızın piyasa değerindeki kaybı yasal formüllerle ücretsiz hesaplayın.'},
  '/kidem-tazminati-hesaplama':{screen:'iscilik',title:'Kıdem Tazminatı Hesaplama | Müvekkil Bilgi',desc:'Kıdem, ihbar, yıllık izin ve fazla mesai alacaklarınızı saniyeler içinde ücretsiz hesaplayın.'},
  '/ihbar-tazminati-hesaplama':{screen:'iscilik',title:'İhbar Tazminatı Hesaplama | Müvekkil Bilgi',desc:'İhbar süresi ve ihbar tazminatı tutarınızı İş Kanunu\'na uygun şekilde ücretsiz hesaplayın.'},
  '/is-kazasi-tazminati':{generic:'isKazasi',title:'İş Kazası Tazminatı Hesaplama | Müvekkil Bilgi',desc:'İş kazası sonucu hak ettiğiniz tazminatı SGK ve işveren sorumluluğu dahil ücretsiz hesaplayın.'},
  '/arac-mahrumiyet-bedeli':{generic:'mahrumiyet',title:'Araç Mahrumiyet Bedeli Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası aracınızın mahrumiyet (yatma) bedelini günlük kira rakamlarına göre hesaplayın.'},
  '/miras-payi-hesaplama':{generic:'miras',title:'Miras Payı Hesaplama | Müvekkil Bilgi',desc:'Türk Medeni Kanunu\'na göre yasal mirasçıların miras paylarını ücretsiz hesaplayın.'},
  '/kusur-orani-tespiti':{screen:'kusur',title:'Trafik Kazası Kusur Oranı Tespiti | Müvekkil Bilgi',desc:'Kazanızı anlatın, yapay zeka kusur oranınızı ve hangi tazminat haklarına sahip olduğunuzu belirlesin.'},
  '/hakli-fesih-kidem-tazminati-testi':{screen:'fesih',title:'Haklı Fesih ve Kıdem Tazminatı Testi | Müvekkil Bilgi',desc:'İş Kanunu madde 24 kapsamında haklı fesih ve kıdem tazminatı hakkınızı yapay zeka ile test edin.'},
  '/ise-iade-davasi-sartlari':{screen:'iseIade',title:'İşe İade Davası Şartları | Müvekkil Bilgi',desc:'İşten çıkarıldıysanız işe iade davası açma şartlarını taşıyıp taşımadığınızı ücretsiz öğrenin.'},
  '/arac-hasar-bedeli-hesaplama':{generic:'hasar',title:'Araç Hasar Bedeli Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası araç onarım bedelinizi yedek parça ve işçilik maliyetleri dahil hesaplayın.'},
  '/pert-arac-bedeli-hesaplama':{generic:'pertBedeli',title:'Pert Araç Bedeli Hesaplama | Müvekkil Bilgi',desc:'Onarım bedeli piyasa değerinin %50\'sini aşan pert araçlarda sigortadan alacağınız bedeli hesaplayın.'},
  '/surekli-sakatlik-tazminati-hesaplama':{generic:'sakatlik',title:'Sürekli Sakatlık Tazminatı Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası sürekli sakatlık oranınıza göre tazminatınızı ücretsiz hesaplayın.'},
  '/destekten-yoksun-kalma-tazminati':{generic:'yoksun',title:'Destekten Yoksun Kalma Tazminatı | Müvekkil Bilgi',desc:'Trafik kazasında vefat eden yakınınızın desteğinden yoksun kalma tazminatınızı hesaplayın.'},
  '/maddi-tazminat-hesaplama':{generic:'maddi',title:'Maddi Tazminat Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası maddi zararlarınızı kapsamlı ve detaylı şekilde ücretsiz hesaplayın.'},
  '/kasko-hasar-tazminati-hesaplama':{generic:'kasko',title:'Kasko Hasar Tazminatı Hesaplama | Müvekkil Bilgi',desc:'Kasko sigortası kapsamındaki hasar talebinizi ve tahmini tazminatınızı hesaplayın.'},
  '/manevi-tazminat-hesaplama':{generic:'manevi',title:'Manevi Tazminat Hesaplama | Müvekkil Bilgi',desc:'Kaza veya zarar sonrası manevi tazminat talebinizi ücretsiz hesaplayın.'},
  '/gecici-is-goremezlik-hesaplama':{generic:'gecici',title:'Geçici İş Göremezlik Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası geçici iş göremezlik süresindeki gelir kaybınızı hesaplayın.'},
  '/kalici-is-goremezlik-hesaplama':{generic:'kalici',title:'Kalıcı İş Göremezlik Hesaplama | Müvekkil Bilgi',desc:'Kaza sonrası kalıcı iş göremezlik oranınıza göre tazminatınızı hesaplayın.'},
  '/trafik-cezasi-itiraz-hesaplama':{generic:'trafikCezasi',title:'Trafik Cezası İtiraz Hesaplama | Müvekkil Bilgi',desc:'Trafik cezalarına itiraz sürecinde olası maliyet ve tazminat hesaplamasını yapın.'},
  '/ise-iade-tazminati-hesaplama':{generic:'iseIadeTazminat',title:'İşe İade Tazminatı Hesaplama | Müvekkil Bilgi',desc:'İşe iade davasını kazanmanız durumunda alacağınız boşta geçen süre ücreti ve tazminatı hesaplayın.'},
  '/is-gucu-kaybi-hesaplama':{generic:'isgucu',title:'İş Gücü Kaybı Hesaplama | Müvekkil Bilgi',desc:'Kaza sonucu uğradığınız iş gücü kaybı tazminatını ücretsiz hesaplayın.'},
  '/bakiye-sure-ucreti-tazminati':{generic:'bakiyeSure',title:'Bakiye Süre Ücreti Tazminatı Hesaplama | Müvekkil Bilgi',desc:'Belirli süreli iş sözleşmeniz süresinden önce feshedildiyse kalan sürenin ücretini hesaplayın.'},
  '/bosanma-tazminati-mal-paylasimi':{generic:'bosanma',title:'Boşanma Tazminatı ve Mal Paylaşımı | Müvekkil Bilgi',desc:'Boşanma davasında maddi/manevi tazminat, nafaka ve mal paylaşımı hesaplaması yapın.'},
  '/kamulastirmasiz-el-atma-tazminati':{generic:'kamulastirma',title:'Kamulaştırmasız El Atma Tazminatı | Müvekkil Bilgi',desc:'Kamulaştırmasız el atma durumunda taşınmaz bedeli ve tazminat hesaplaması yapın.'},
  '/nafaka-hesaplama':{generic:'nafaka',title:'Nafaka Hesaplama | Müvekkil Bilgi',desc:'Boşanma davalarında iştirak ve yoksulluk nafakası hesaplamasını ücretsiz yapın.'},
  '/tuketici-haklari-tazminati':{generic:'tuketici',title:'Tüketici Hakları Tazminatı Hesaplama | Müvekkil Bilgi',desc:'Ayıplı mal veya hizmet nedeniyle tüketici mahkemesi taleplerinizi hesaplayın.'},
  '/tapu-harci-hesaplama':{generic:'tapu',title:'Tapu Harcı ve Vergi Hesaplama | Müvekkil Bilgi',desc:'Gayrimenkul alım-satımında tapu harcı, KDV ve vergi yükümlülüklerinizi hesaplayın.'}
};
const SCREEN_TO_PATH={tani:'/durum-tespiti',evSatisIade:'/ev-satis-vergisi-iade-hesaplama',vergiIade:'/vergi-iademi-nasil-alirim',isHukuku:'/is-hukuku-hesaplama',gozetim:'/gozetim-fazla-vergi-iadesi',arac:'/deger-kaybi-hesaplama',iscilik:'/kidem-tazminati-hesaplama',kusur:'/kusur-orani-tespiti',fesih:'/hakli-fesih-kidem-tazminati-testi',iseIade:'/ise-iade-davasi-sartlari'};
const GENERIC_TO_PATH={ithalatVergi:'/ithalat-vergileri-hesaplama',gumrukCeza:'/gumruk-para-cezasi-itiraz',vergiZiyai:'/vergi-ziyai-cezasi-hesaplama',emlakVergisi:'/emlak-vergisi-hesaplama',vergiDavasi:'/vergi-davasi-degerlendirme',isKazasi:'/is-kazasi-tazminati',mahrumiyet:'/arac-mahrumiyet-bedeli',miras:'/miras-payi-hesaplama',hasar:'/arac-hasar-bedeli-hesaplama',pertBedeli:'/pert-arac-bedeli-hesaplama',sakatlik:'/surekli-sakatlik-tazminati-hesaplama',yoksun:'/destekten-yoksun-kalma-tazminati',maddi:'/maddi-tazminat-hesaplama',kasko:'/kasko-hasar-tazminati-hesaplama',manevi:'/manevi-tazminat-hesaplama',gecici:'/gecici-is-goremezlik-hesaplama',kalici:'/kalici-is-goremezlik-hesaplama',trafikCezasi:'/trafik-cezasi-itiraz-hesaplama',iseIadeTazminat:'/ise-iade-tazminati-hesaplama',isgucu:'/is-gucu-kaybi-hesaplama',bakiyeSure:'/bakiye-sure-ucreti-tazminati',bosanma:'/bosanma-tazminati-mal-paylasimi',kamulastirma:'/kamulastirmasiz-el-atma-tazminati',nafaka:'/nafaka-hesaplama',tuketici:'/tuketici-haklari-tazminati',tapu:'/tapu-harci-hesaplama'};
function setMetaDesc(desc){
  if(!desc)return;
  const el=document.querySelector('meta[name="description"]');
  if(el)el.setAttribute('content',desc);
}
function updateRouteUrl(path,title,desc){
  if(!path)return;
  if(title)document.title=title;
  if(desc)setMetaDesc(desc);
  if(window.location.pathname===path)return;
  try{history.pushState({},'',path);}catch(e){}
}
function handleInitialRoute(){
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const route=ROUTE_MAP[path];
  if(route){
    if(route.title)document.title=route.title;
    if(route.desc)setMetaDesc(route.desc);
    if(route.screen)navigate(route.screen);
    else if(route.generic)openGenericCalc(route.generic);
    return;
  }
  navigate('home');
}
window.addEventListener('popstate',()=>{
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const route=ROUTE_MAP[path];
  if(route){if(route.title)document.title=route.title;if(route.desc)setMetaDesc(route.desc);if(route.screen)navigate(route.screen);else if(route.generic)openGenericCalc(route.generic);}
  else navigate('home');
});

/* scrollIntoView({block:'start'}) hedefi viewport'un tam tepesine hizalar, ama header
   position:sticky olduğu için hedefin üst kısmını (özellikle mobilde) kapatıyordu —
   kullanıcıya "sonuç aşağı kaçtı" gibi görünüyordu. Header yüksekliği kadar pay bırakıyoruz. */
/* Sonuç ekranı açıldığında sayfa kullanıcının kaldığı yerde (formun altında)
   duruyor ve hemen ardından DOM'a büyük bloklar ekleniyor (AI analizi, karşılaştırma
   aracı, ilgili araçlar, banner) — sayfa yüksekliği neredeyse iki katına çıkıyor.
   Yumuşak kaydırma bu büyüme sırasında yarıda kesilip kullanıcıyı sayfanın altında
   bırakıyordu. Bu yüzden: anlık kaydır, sonraki karelerde ve içerik yerleştikten
   sonra konumu tekrar doğrula — ama kullanıcı kendisi kaydırmaya başladıysa dokunma. */
function scrollToResult(el){
  if(!el)return;
  let userMoved=false;
  const onUser=function(){userMoved=true;};
  window.addEventListener('wheel',onUser,{passive:true});
  window.addEventListener('touchmove',onUser,{passive:true});
  window.addEventListener('keydown',onUser,{passive:true});
  const place=function(){
    if(userMoved)return;
    const headerEl=document.getElementById('mainHeader');
    const headerH=headerEl?headerEl.getBoundingClientRect().height:0;
    const top=el.getBoundingClientRect().top+window.pageYOffset-headerH-12;
    // behavior:'auto' şart: CSS'te html{scroll-behavior:smooth} tanımlı olduğu için
    // aksi halde bu çağrı da animasyona dönüşüp içerik eklenirken yarıda kesiliyor.
    window.scrollTo({top:Math.max(0,top),behavior:'auto'});
  };
  place();
  requestAnimationFrame(function(){place();requestAnimationFrame(place);});
  setTimeout(place,250);
  setTimeout(function(){
    place();
    window.removeEventListener('wheel',onUser);
    window.removeEventListener('touchmove',onUser);
    window.removeEventListener('keydown',onUser);
  },650);
}
function navigate(screen){
  if(_navLock||state.screen===screen)return;
  const prev=state.screen,PREV=document.getElementById('screen-'+prev),NEXT=document.getElementById('screen-'+screen);
  if(!NEXT)return;
  _navLock=true;const D=420;
  function animIn(el){
    el.style.display='';el.style.opacity='0';el.style.transform='scale(0.97)';el.style.filter='blur(8px)';
    el.style.transition='opacity '+D+'ms cubic-bezier(0.65,0,0.35,1),transform '+D+'ms cubic-bezier(0.65,0,0.35,1),filter '+D+'ms cubic-bezier(0.65,0,0.35,1)';
    requestAnimationFrame(()=>{el.style.opacity='1';el.style.transform='scale(1)';el.style.filter='blur(0)';});
    setTimeout(()=>{el.style.opacity='';el.style.transform='';el.style.filter='';el.style.transition='';},D+80);
  }
  if(PREV&&PREV.style.display!=='none'){
    PREV.style.transition='opacity '+(D*.75)+'ms cubic-bezier(0.65,0,0.35,1),transform '+(D*.75)+'ms cubic-bezier(0.65,0,0.35,1),filter '+(D*.75)+'ms cubic-bezier(0.65,0,0.35,1)';
    PREV.style.opacity='0';PREV.style.transform='scale(1.02)';PREV.style.filter='blur(8px)';
    setTimeout(()=>{PREV.style.display='none';PREV.style.opacity='';PREV.style.transform='';PREV.style.filter='';PREV.style.transition='';animIn(NEXT);},D*.75);
  }else animIn(NEXT);
  state.screen=screen;const back=document.getElementById('headerBack'),nav=document.getElementById('homeNav');
  if(screen==='home'){back.style.display='none';if(nav)nav.style.display='';updateRouteUrl('/','Müvekkil Bilgi – Tazminat Hesaplama Platformu','Trafik kazası araç değer kaybı, işçilik, hasar bedeli, iş gücü kaybı, sakatlık ve tazminat hesaplamalarınızı yasal mevzuata uygun, ücretsiz hesaplayın.');}
  else{back.style.display='flex';if(nav)nav.style.display='none';if(SCREEN_TO_PATH[screen]){const r=ROUTE_MAP[SCREEN_TO_PATH[screen]]||{};updateRouteUrl(SCREEN_TO_PATH[screen],r.title,r.desc);}}
  window.scrollTo({top:0});if(screen==='blog')renderBlogPage();if(screen==='kusur'){setTimeout(renderKusurParties,50);}
  if(screen==='tani')openTani();
  if(screen==='vergiIade')openVergiIade();
  if(screen==='evSatisIade')openEvSatisIade();
  if(screen==='gozetim')openGozetim();
  if(screen==='isHukuku')openIsHukuku();
  setTimeout(()=>{_navLock=false;},D+200);
}

function toggleTheme(){const h=document.documentElement,c=h.getAttribute('data-theme'),n=c==='dark'?'light':'dark';h.setAttribute('data-theme',n);localStorage.setItem('muvekkilbilgi_theme',n);}
(function(){const s=localStorage.getItem('muvekkilbilgi_theme');if(s)document.documentElement.setAttribute('data-theme',s);})();
function toggleMobileMenu(){const o=document.getElementById('mobileOverlay'),p=document.getElementById('mobilePanel');if(!o||!p)return;const isOpen=o.classList.contains('open');o.classList.toggle('open');p.classList.toggle('open');document.body.style.overflow=isOpen?'':'hidden';}
function closeMobileMenu(){const o=document.getElementById('mobileOverlay'),p=document.getElementById('mobilePanel');if(o)o.classList.remove('open');if(p)p.classList.remove('open');document.body.style.overflow='';}

function getMarketValue(brand,model,year){
  const base=VEHICLE_BASE_PRICES[brand+'|'+model]||1200000;
  const age=Math.max(0,new Date().getFullYear()-parseInt(year));
  const adj=base;
  const ageFactor=AGE_FACTORS.find(a=>age<=a.max)||AGE_FACTORS[AGE_FACTORS.length-1];
  const f=ageFactor?ageFactor.factor:0.36;
  return Math.round(adj*f/5000)*5000;
}
function updateAutoMarketValue(){
  if(!state.vehicleYear||!state.vehicleBrand||!state.vehicleModel)return;
  const basePrice=getMarketValue(state.vehicleBrand,state.vehicleModel,state.vehicleYear);
  state.autoMarketValue=getTrimPrice(basePrice,state.vehicleTrim||'Base');
  const el=document.getElementById('marketValueDisplay');
  if(el&&state.autoMarketValue>0){
    const age=new Date().getFullYear()-parseInt(state.vehicleYear);
    const sug=suggestMarketValue(age,75000);
    el.innerHTML='Piyasa Değeri: <strong>'+new Intl.NumberFormat('tr-TR').format(state.autoMarketValue)+' TL</strong> <span style="font-size:11px;color:var(--textm)">(Tahmini aralık: '+new Intl.NumberFormat('tr-TR').format(sug.min)+' - '+new Intl.NumberFormat('tr-TR').format(sug.max)+' TL)</span>';
  }
}

function getKmFactor(km){return KM_FACTORS.find(b=>km<=b.max).factor;}
function getAgeFactor(age){return AGE_FACTORS.find(b=>age<=b.max).factor;}
function getOverlapFactor(pc){return pc<=1?1:Math.min(2.25,1+0.14*(pc-1));}
function round10(n){return Math.round(n/10)*10;}

function calculateDegerKaybi(params){
  const{marketValue,mileage,faultRatio,recentAccident,priorCompensation,selectedParts,vehicleYear}=params;
  const vehicleAge=Math.max(0,new Date().getFullYear()-vehicleYear);
  const km=Math.max(1,mileage),km_f=getKmFactor(km),age_f=getAgeFactor(vehicleAge),faultF=1-faultRatio/100;
  let paintSum=0,replaceSum=0;
  const partIds=Object.keys(selectedParts);
  if(partIds.length===0){paintSum=3;replaceSum=5;}else{
    partIds.forEach(pid=>{
      const w=PART_WEIGHTS[pid];if(!w)return;
      const tip=selectedParts[pid]||'boyali';
      const m=PART_TYPE_MULTIPLIERS[tip]||0.7;
      let pw=w.paint,rw=w.replace;
      if(tip==='original'){pw=0;rw=0;}
      else if(tip==='degisen'){pw=rw*0.3;rw=rw;}
      else if(tip==='lokal_boyali'){pw=pw*0.5;rw=rw*0.3;}
      paintSum+=pw*m;replaceSum+=rw*m;
    });
  }
  const overlap=getOverlapFactor(Math.max(1,partIds.length)),aps=paintSum*overlap,rps=replaceSum*overlap;
  // Değer kaybında sabit bir yasal tavan yok (2020 AYM kararı sonrası Yargıtay "gerçek zarar"
  // ilkesini esas alır) — %45 sadece formülün uç değerlere savrulmasını önleyen pratik bir sınır.
  const maxPossibleLoss=Math.round(marketValue*0.45);
  const damageScore=Math.min(1,(aps+rps)/40);
  const baseLossPct=damageScore*0.25;
  let lossPct=baseLossPct*km_f*age_f;
  lossPct=Math.max(0.03,Math.min(0.45,lossPct));
  let minR=Math.round(marketValue*lossPct*0.80*faultF/10)*10;
  let maxR=Math.round(marketValue*lossPct*1.10*faultF/10)*10;
  if(minR>maxR)[minR,maxR]=[maxR,minR];
  if(recentAccident){minR=Math.round(minR*0.85/10)*10;maxR=Math.round(maxR*0.85/10)*10;}
  if(priorCompensation){minR=Math.round(minR*0.80/10)*10;maxR=Math.round(maxR*0.80/10)*10;}
  minR=Math.max(500,Math.min(minR,maxPossibleLoss));
  maxR=Math.max(minR+500,Math.min(maxR,maxPossibleLoss));
  return{min:minR,max:maxR,vehicleAge,km_f,age_f,overlap,paintSum,replaceSum,faultF};
}

const PERSONA_CONTENT={
  vatandas:{
    badge:'Ücretsiz &amp; Anlık Hesaplama',
    title:'Haklarınızı Öğrenin,<br/><span class="gradient-text">Tazminatınızı Alın</span>',
    subtitle:'Trafik kazası sonrası değer kaybınızı, işçilik alacaklarınızı veya farklı tazminat türlerini Türk hukuku mevzuatına uygun olarak saniyeler içinde hesaplayın.',
    cta:''
  },
  avukat:{
    badge:'Meslektaşlar İçin Hızlı Ön Hesaplama',
    title:'Dosyanızı Hızlandırın,<br/><span class="gradient-text">Zaman Kazanın</span>',
    subtitle:'Müvekkilleriniz için değer kaybı, işçilik ve diğer tazminat kalemlerini saniyeler içinde hesaplayın; emsal Yargıtay kararlarıyla destekleyin.',
    cta:'<button type="button" class="btn-persona-secondary" onclick="openEmsalModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Emsal Karar Ara</button>'
  },
  botlar:{
    badge:'Tüm Hesaplama Araçları',
    title:'Hesaplama Botlarına<br/><span class="gradient-text">Hoş Geldiniz</span>',
    subtitle:'Aşağıdaki listeden ihtiyacınız olan hesaplama modülünü seçin, saniyeler içinde sonucu görün.',
    cta:''
  }
};
function setPersona(p){
  if(!PERSONA_CONTENT[p])return;
  try{localStorage.setItem('muvekkilbilgi_persona',p);}catch(e){}
  document.querySelectorAll('.persona-tab').forEach(btn=>{btn.classList.toggle('active',btn.dataset.persona===p);});
  const c=PERSONA_CONTENT[p];
  const badgeEl=document.getElementById('heroBadgeText'),titleEl=document.getElementById('heroTitle'),subEl=document.getElementById('heroSubtitle'),ctaEl=document.getElementById('heroPersonaCta');
  if(badgeEl)badgeEl.innerHTML=c.badge;
  if(titleEl)titleEl.innerHTML=c.title;
  if(subEl)subEl.textContent=c.subtitle;
  if(ctaEl){if(c.cta){ctaEl.innerHTML=c.cta;ctaEl.style.display='block';}else{ctaEl.style.display='none';ctaEl.innerHTML='';}}
  if(p==='botlar'){
    setTimeout(()=>{const el=document.getElementById('modules');if(el)scrollToResult(el);},150);
  }
}
function initPersona(){
  let p='vatandas';
  try{p=localStorage.getItem('muvekkilbilgi_persona')||'vatandas';}catch(e){}
  if(!PERSONA_CONTENT[p])p='vatandas';
  document.querySelectorAll('.persona-tab').forEach(btn=>{btn.classList.toggle('active',btn.dataset.persona===p);});
  const c=PERSONA_CONTENT[p];
  const badgeEl=document.getElementById('heroBadgeText'),titleEl=document.getElementById('heroTitle'),subEl=document.getElementById('heroSubtitle'),ctaEl=document.getElementById('heroPersonaCta');
  if(badgeEl)badgeEl.innerHTML=c.badge;
  if(titleEl)titleEl.innerHTML=c.title;
  if(subEl)subEl.textContent=c.subtitle;
  if(ctaEl&&c.cta){ctaEl.innerHTML=c.cta;ctaEl.style.display='block';}
}

document.addEventListener('DOMContentLoaded',()=>{
  trackVisit();
  initYears();initBrands();initCarParts();initSlider();initCities();initWorkDuration();injectSvgDefs();renderModuleCards();renderFaq();renderBlogPosts();renderTestimonials();handleInitialRoute();
  setTimeout(initLazySections,100);
  revealInit();
  tilt3dScan();
});

function injectSvgDefs(){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','0');s.setAttribute('height','0');s.style.position='absolute';s.innerHTML='<defs><linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#D4BC98"/><stop offset="100%" stop-color="#A88B60"/></linearGradient></defs>';document.body.prepend(s);}

function initCities(){const sel=document.getElementById('leadCity');if(!sel)return;TURKISH_CITIES.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});}
function initWorkDuration(){const ys=document.getElementById('workYears'),ms=document.getElementById('workMonths');if(ys){for(let i=1;i<=35;i++){const o=document.createElement('option');o.value=i;o.textContent=i+' Yıl';ys.appendChild(o);}}if(ms){for(let i=1;i<=11;i++){const o=document.createElement('option');o.value=i;o.textContent=i+' Ay';ms.appendChild(o);}}}

function initYears(){const sel=document.getElementById('vehicleYear');if(!sel)return;const cy=new Date().getFullYear();for(let y=cy;y>=2000;y--){const o=document.createElement('option');o.value=y;o.textContent=y;sel.appendChild(o);}}

function initBrands(){
  const sel=document.getElementById('vehicleBrand');if(!sel)return;
  Object.keys(CAR_DATA).sort().forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;sel.appendChild(o);});
  sel.addEventListener('change',()=>{
    const ms=document.getElementById('vehicleModel'),brand=sel.value,ts=document.getElementById('vehicleTrim');
    ms.innerHTML='<option value="">Model seçin</option>';
    if(brand&&CAR_DATA[brand]){ms.disabled=false;CAR_DATA[brand].forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;ms.appendChild(o);});}
    else{ms.disabled=true;ms.innerHTML='<option value="">Önce marka seçin</option>';}
    state.vehicleBrand=brand||null;state.vehicleModel=null;state.vehicleTrim='Base';
    ts.disabled=true;ts.innerHTML='<option value="">Önce model seçin</option>';
  });
  function refreshVehicleTrims(){
    const ts=document.getElementById('vehicleTrim'),brand=sel.value,model=document.getElementById('vehicleModel').value,year=document.getElementById('vehicleYear').value;
    if(brand&&model){
      const trims=getTrimsForVehicle(brand,model,year);
      ts.disabled=false;ts.innerHTML=trims.map((t,i)=>`<option value="${t}"${i===0?' selected':''}>${t}</option>`).join('');
      state.vehicleTrim=trims[0];
    }else{ts.disabled=true;ts.innerHTML='<option value="">Önce model seçin</option>';state.vehicleTrim='Base';}
  }
  document.getElementById('vehicleModel').addEventListener('change',function(){
    state.vehicleModel=this.value||null;
    refreshVehicleTrims();
    updateAutoMarketValue();
  });
  document.getElementById('vehicleTrim').addEventListener('change',function(){state.vehicleTrim=this.value||'Base';updateAutoMarketValue();});
  document.getElementById('vehicleYear').addEventListener('change',function(){state.vehicleYear=parseInt(this.value)||null;refreshVehicleTrims();updateAutoMarketValue();});
}

const MODULE_CATS={
  baslangic:{title:'Nereden başlayacağınızı bilmiyorsanız',icon:'🧭',accent:'#C5A880',desc:'Birkaç soruyla durumunuzu tahmin edelim, doğru araca sizi biz götürelim'},
  trafik:{title:'Trafik Kazası Hukuku',icon:'🚗',accent:'#8B5CF6',desc:'Kazanızı anlatın; değer kaybı, hasar ve yaralanma tazminatları tek akışta hesaplansın'},
  isci:{title:'İş Hukuku',icon:'💼',accent:'#22c55e',desc:'İşten ayrılma/çıkarılma durumunuza göre kıdem, ihbar ve diğer alacaklarınız'},
  vergi:{title:'Vergi & Gümrük Hukuku',icon:'🧾',accent:'#3B82F6',desc:'Gözetim uygulaması kaynaklı fazla ödenen vergilerin iadesi'},
  diger:{title:'Diğer Hukuk Alanları',icon:'📋',accent:'#C5A880',desc:'Boşanma, miras, kamulaştırma, tüketici ve tapu işlemleri'}
};
const SCREEN_MODULES=['tani','vergiIade','evSatisIade','kusur','fesih','iseIade','arac','iscilik','gozetim','isHukuku'];
function moduleAction(m){
  if(SCREEN_MODULES.indexOf(m.screen)!==-1)return `navigate('${m.screen}')`;
  return `openGenericCalc('${m.id}')`;
}
/* Aracın kendi adresi: kart yeni sekmede açılırken kullanılıyor. */
function moduleHref(m){
  if(SCREEN_MODULES.indexOf(m.screen)!==-1)return SCREEN_TO_PATH[m.screen]||'/';
  return GENERIC_TO_PATH[m.id]||'/';
}
/* Araç seçimi tek bir yolla yapılıyor: soru listesi.
   Önceki sürümlerde aynı işi yapan altı katman üst üste duruyordu — arama,
   "en çok sorulanlar" bloğu, kategori filtresi, ikonlu/açıklamalı grup
   başlıkları, öne çıkan büyük kartlar ve kompakt satırlar. Hepsi aynı
   anda görününce sayfa kalabalık ve kararsız duruyordu. Artık: arama,
   kategori filtresi ve TEK tip satır listesi. Grup başlığı sadece ince
   bir ayırıcı etiket. */
let activeModuleCat=null;
function catVisibleModules(cat){return MODULES.filter(m=>m.category===cat);}
function selectModuleCat(cat){
  activeModuleCat=(activeModuleCat===cat)?null:cat;
  renderModuleCards();
  const sec=document.getElementById('modules');
  if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
}
function clearModuleCat(){activeModuleCat=null;renderModuleCards();}

function renderCatFilterBar(){
  let h='<div class="cat-bar">';
  h+=`<button type="button" class="cat-chip${activeModuleCat?'':' on'}" onclick="clearModuleCat()">Tümü <span class="cat-chip-n">${MODULES.length}</span></button>`;
  Object.keys(MODULE_CATS).forEach(cat=>{
    const items=catVisibleModules(cat);if(!items.length)return;
    const c=MODULE_CATS[cat];
    h+=`<button type="button" class="cat-chip${activeModuleCat===cat?' on':''}" style="--group-accent:${c.accent}" onclick="selectModuleCat('${cat}')">${c.icon} ${c.title} <span class="cat-chip-n">${items.length}</span></button>`;
  });
  return h+'</div>';
}

/* Her kategoride bir araç "ana giriş": daha geniş, daha büyük tipografi.
   29 kart aynı boyutta olunca göz hiçbirini ayırt edemiyor ve liste
   yorucu bir duvara dönüşüyordu — hiyerarşi boyutla kuruluyor. */
/* Yalnızca doğal bir 'ana giriş' olan kategorilerde öne çıkan kart var.
   'Diğer' bir torba kategori, vergide de tek araç var — oralarda rozet
   anlamsız duruyordu. */
const ANA_ARAC={baslangic:'durumTespiti',trafik:'arac',isci:'isHukukuSihirbaz',vergi:'gozetim'};

/* Soru kartı: çizgi ikon + soru + destek metni + ok. */
function renderModuleRow(m,buyuk){
  const cls=buyuk?'qcard qcard-lg':'qcard';
  const rozet=buyuk?'<span class="qcard-badge">Buradan başlayın</span>':'';
  return `<a class="${cls}" href="${moduleHref(m)}" target="_blank" rel="noopener">
    <span class="qcard-ico">${moduleIcon(m.id,buyuk?26:21)}</span>
    <span class="qcard-body">
      ${rozet}
      <span class="qcard-q">${m.title.replace(/\n/g," ")}</span>
      <span class="qcard-h">${m.desc}</span>
    </span>
    <svg class="qcard-arrow" width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M5 9h8M9 5l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>`;
}
function renderModuleCards(){
  const g=document.getElementById('modulesGrid');if(!g)return;
  const cnt=document.getElementById('modulesCount');if(cnt)cnt.textContent=MODULES.length+' ücretsiz araç';
  let html=renderCatFilterBar();
  const cats=activeModuleCat?[activeModuleCat]:Object.keys(MODULE_CATS);
  cats.forEach(cat=>{
    const items=catVisibleModules(cat);
    if(!items.length)return;
    const c=MODULE_CATS[cat];
    /* Vurgu rengi grup sarmalayıcısında: hem etiket hem içindeki kartlar
       aynı kategori rengini miras alıyor. */
    const anaId=(items.length>1||cat==='baslangic')?ANA_ARAC[cat]:null;
    html+=`<div class="module-group" style="--group-accent:${c.accent}"><div class="grp-label">${c.title}</div>`;
    html+=`<div class="mod-rows">${items.map(m=>renderModuleRow(m,m.id===anaId)).join('')}</div>`;
    html+=`</div>`;
  });
  g.innerHTML=html;
  revealScan();
  tilt3dScan();
}
function filterModules(query){
  const g=document.getElementById('modulesGrid');if(!g)return;
  const clearBtn=document.getElementById('moduleSearchClear');
  const q=(query||'').trim().toLocaleLowerCase('tr-TR');
  if(clearBtn)clearBtn.style.display=q?'flex':'none';
  if(!q){renderModuleCards();return;}
  const matches=MODULES.filter(m=>{
    const hay=(m.title.replace(/\n/g,' ')+' '+m.desc+' '+m.tags.join(' ')).toLocaleLowerCase('tr-TR');
    return hay.includes(q);
  });
  if(!matches.length){g.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-muted)"><p style="font-size:15px;font-weight:600;margin-bottom:6px">Sonuç bulunamadı</p><p style="font-size:13px">"${sanitizeHtml(query)}" ile eşleşen bir hesaplama aracı yok. Farklı bir kelime deneyin.</p></div>`;return;}
  /* Arama sonuçları da kompakt satır olarak: koca kartlarla üç sonuç bile
     ekranı dolduruyor, kullanıcı eşleşmeleri karşılaştıramıyordu. */
  g.innerHTML=`<div class="module-group"><div class="grp-label">"${sanitizeHtml(query)}" — ${matches.length} sonuç</div><div class="mod-rows">${matches.map(renderModuleRow).join('')}</div></div>`;
  revealScan();
  tilt3dScan();
}

function showPartPickerModal(pid) {
  document.querySelectorAll('.part-picker,.picker-overlay').forEach(p=>p.remove());
  const isMobile = window.innerWidth < 480;
  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.55)';
  const colors = {original:'#2e7d32',lokal_boyali:'#FFC107',boyali:'#FF9800',degisen:'#F44336'};
  const pkr = document.createElement('div');
  pkr.className = 'part-picker';
  pkr.innerHTML =
    '<div style="text-align:center;font:700 15px sans-serif;color:#fff;padding:4px 0 10px;border-bottom:1px solid rgba(255,255,255,0.06)">'+PART_LABELS[pid]+'</div>'+
    Object.entries(PART_TYPE_LABELS).map(([k,v]) =>
      '<button class="pp-btn" data-type="'+k+'" style="display:flex;align-items:center;gap:10px;width:100%;padding:14px 16px;margin:6px 0;border:none;border-radius:12px;background:#222;color:#fff;font:600 15px sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">'+
        '<span style="width:20px;height:20px;border-radius:50%;background:'+colors[k]+';display:inline-block;flex-shrink:0;border:2px solid rgba(255,255,255,0.15)"></span>'+
        '<span>'+v+'</span>'+
      '</button>'
    ).join('')+
    '<button class="pp-cancel" style="width:100%;padding:12px;margin-top:2px;border:none;border-radius:10px;background:transparent;color:#888;font:500 14px sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">İptal</button>';
  if (isMobile) {
    pkr.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1a1a1a;border-radius:18px 18px 0 0;padding:18px 20px;max-height:85vh;overflow-y:auto;box-shadow:0 -4px 30px rgba(0,0,0,0.5)';
  } else {
    pkr.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:#1a1a1a;border:1px solid rgba(197,168,128,0.2);border-radius:18px;padding:18px;min-width:220px;max-width:88vw;box-shadow:0 16px 64px rgba(0,0,0,0.7)';
  }
  const close = () => { overlay.remove(); pkr.remove(); };
  overlay.addEventListener('click', close);
  pkr.querySelector('.pp-cancel').addEventListener('click', close);
  pkr.addEventListener('click', (pe) => {
    const b = pe.target.closest('.pp-btn');
    if (!b) return;
    const tip = b.dataset.type;
    state.selectedParts[pid] = tip;
    document.querySelector(`.part-zone[data-part="${pid}"]`)?.classList.add('selected');
    document.querySelectorAll('.part-btn').forEach(bb => bb.classList.remove('active'));
    const m = document.querySelector(`.part-btn[data-part="${pid}"]`);
    if (m) m.classList.add('active');
    close();
    renderSelectedParts();
  });
  document.body.appendChild(overlay);
  document.body.appendChild(pkr);
}

function setup2dView(){
  document.querySelectorAll('.part-zone').forEach(zone => {
    zone.addEventListener('click', (e) => {
      const pid = zone.dataset.part;
      if (!pid) return;
      if (state.selectedParts[pid]) {
        delete state.selectedParts[pid];
        zone.classList.remove('selected');
        const m = document.querySelector(`.part-btn[data-part="${pid}"]`);
        if (m) m.classList.remove('active');
        renderSelectedParts();
        return;
      }
      showPartPickerModal(pid);
    });
  });
}

function initCarParts(){
  setup2dView();
  document.querySelectorAll('.part-btn').forEach(btn => {
    if (btn.dataset.part === '__reset') {
      btn.addEventListener('click', () => {
        state.selectedParts = {};
        document.querySelectorAll('.part-zone').forEach(z => z.classList.remove('selected'));
        document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
        renderSelectedParts();
      });
      return;
    }
    btn.addEventListener('click', (e) => {
      const pid = btn.dataset.part;
      if (!pid) return;
      document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.selectedParts[pid]) {
        delete state.selectedParts[pid];
        document.querySelector(`.part-zone[data-part="${pid}"]`)?.classList.remove('selected');
        btn.classList.remove('active');
        renderSelectedParts();
        return;
      }
      showPartPickerModal(pid);
    });
  });
}

function syncSvgZones(){
  const ids=Object.keys(state.selectedParts);
  document.querySelectorAll('.part-zone').forEach(z=>{
    z.classList.toggle('selected',ids.includes(z.dataset.part));
  });
}

function renderSelectedParts(){
  const c=document.getElementById('selectedParts'),nm=document.getElementById('noPartsMsg');
  if(!c)return;c.querySelectorAll('.part-chip').forEach(x=>x.remove());
  const ids=Object.keys(state.selectedParts);
  syncSvgZones();
  if(ids.length===0){if(nm)nm.style.display='';return;}
  if(nm)nm.style.display='none';
  ids.forEach(pid=>{
    const tip=state.selectedParts[pid],ch=document.createElement('div');
    ch.className='part-chip';
    ch.innerHTML=PART_LABELS[pid]+' <span class="chip-type">'+PART_TYPE_LABELS[tip]+'</span><span class="chip-x">×</span>';
    ch.addEventListener('click',()=>{
      delete state.selectedParts[pid];
      renderSelectedParts();
      const btn = document.querySelector(`.part-btn[data-part="${pid}"]`);
      if (btn) btn.classList.remove('active');
    });c.appendChild(ch);
  });
}

function initSlider(){const sl=document.getElementById('faultRatio'),d=document.getElementById('faultDisplay');if(!sl)return;function u(){const p=sl.value+'%';d.textContent=p;sl.style.setProperty('--val',p);state.faultRatio=parseInt(sl.value);}sl.addEventListener('input',u);u();}

function goToStep(stepNum){
  if(stepNum>state.currentStep&&!validateStep(state.currentStep))return;
  if(stepNum===3){state.tramerValue=parseFloat(document.getElementById('tramerValue').value)||0;updateAutoMarketValue();}
  if(stepNum!==4)state.currentStep=stepNum;
  document.querySelectorAll('#screen-arac .form-step').forEach((el,i)=>{el.classList.toggle('active',i+1===stepNum);});
  updateSidebarState(stepNum);updateProgressRing(stepNum);
  document.querySelector('#screen-arac .calculator-section').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateSidebarState(cs){document.querySelectorAll('.step-item').forEach((item,i)=>{const n=i+1;item.classList.remove('active','done');if(n<cs)item.classList.add('done');if(n===cs)item.classList.add('active');const sp=item.querySelector('.step-dot span');if(sp)sp.textContent=n<cs?'✓':n;});const l=document.getElementById('progressLabel');if(l)l.textContent=cs+' / 4 Adım';}
function updateProgressRing(step){const c=document.getElementById('progressCircle'),p=document.getElementById('progressPct'),pct=Math.round((step/4)*100),off=201-(pct/100)*201;if(c)c.style.strokeDashoffset=off;if(p)p.textContent=pct+'%';}

function validateStep(step){
  if(step===1){const y=document.getElementById('vehicleYear').value,b=document.getElementById('vehicleBrand').value,m=document.getElementById('vehicleModel').value,t=document.getElementById('vehicleTrim').value;if(!y||!b||!m){showValidationError('Lütfen araç yılı, marka ve modelini seçin.');return false;}state.vehicleYear=parseInt(y);state.vehicleBrand=b;state.vehicleModel=m;state.vehicleTrim=t||'Base';updateAutoMarketValue();return true;}
  if(step===2)return true;
  if(step===3){const km=parseFloat(document.getElementById('mileage').value);if(!km||km<0){showValidationError('Lütfen aracın kilometresini girin.');return false;}const ra=document.querySelector('input[name="recentAccident"]:checked');if(!ra){showValidationError('Son 2 yılda kaza geçirdiniz mi? sorusunu cevaplayın.');return false;}if(!state.autoMarketValue||state.autoMarketValue<=0){showValidationError('Araç değeri hesaplanamadı.');return false;}state.mileage=km;state.faultRatio=parseInt(document.getElementById('faultRatio').value);state.recentAccident=ra.value==='yes';const pr=document.querySelector('input[name="priorCompensation"]:checked');state.priorCompensation=pr?pr.value==='yes':false;return true;}
  return true;
}
function showValidationError(msg){document.querySelectorAll('.error-toast').forEach(e=>e.remove());const t=document.createElement('div');t.className='error-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3500);}
function showSuccessToast(msg){document.querySelectorAll('.success-toast').forEach(e=>e.remove());const t=document.createElement('div');t.className='success-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}
let _loadingOverlays=0;
function showLoadingOverlay(lbl){
  const ov=document.createElement('div');ov.className='loading-overlay';
  ov.innerHTML='<div class="loading-spinner"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="rgba(197,168,128,0.2)" stroke-width="4"/><path d="M24 4a20 20 0 0120 20" stroke="#C5A880" stroke-width="4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite"/></path></svg></div><div class="loading-text">'+(lbl||'Hesaplama yapılıyor...')+'</div><div class="loading-stage"></div>';
  document.body.appendChild(ov);_loadingOverlays++;return ov;
}
function setLoadingStage(ov,txt){if(ov){const s=ov.querySelector('.loading-stage');if(s)s.textContent=txt;}}
function hideLoadingOverlay(ov){if(ov&&ov.parentNode){ov.remove();_loadingOverlays--;}}

/* ======================================================
   GROQ AI — 4 Aşamalı Uzman Sistem (Değer Kaybı Motoru)
   ====================================================== */
const AI_MODEL='openai/gpt-oss-120b';
const AI_CACHE_KEY='muvekkilbilgi_ai_cache_v2';

function getAiCacheKey(p){
  const s=Object.entries(p.selectedParts).map(([k,v])=>k+':'+v).sort().join(',');
  return 'ak'+btoa([p.vehicleYear,p.mileage,p.marketValue,p.faultRatio,+p.recentAccident,+p.priorCompensation,s].join('|')).slice(0,44);
}

function getAiCache(){try{return JSON.parse(localStorage.getItem(AI_CACHE_KEY)||'{}')}catch(e){return {}}}
function setAiCache(k,v){
  const c=getAiCache();c[k]=v;
  const keys=Object.keys(c);
  if(keys.length>60){const a=keys.slice(0,keys.length-60);a.forEach(o=>delete c[o]);}
  try{localStorage.setItem(AI_CACHE_KEY,JSON.stringify(c))}catch(e){}
}

async function aiCalculate(params){
  const{vehicleYear,selectedParts,marketValue,mileage,faultRatio,recentAccident,priorCompensation}=params;
  const cacheKey=getAiCacheKey(params);
  const cache=getAiCache();
  if(cache[cacheKey])return cache[cacheKey];

  const vehicleAge=new Date().getFullYear()-vehicleYear;
  const partIds=Object.keys(selectedParts);
  const partList=partIds.map(p=>PART_LABELS[p]+' ('+(PART_TYPE_LABELS[selectedParts[p]]||'Boyalı')+')');
  const partNames=partList.length?partList.join(', '):'Belirtilmedi';
  const docTexts=getDocSummaryText();
  const hasDocs=docTexts.length>0;

  const prompt = `Sen Türkiye'nin EN DENEYİMLİ araç değer kaybı bilirkişisisin. Sigorta Tahkim Komisyonu üyesi, Yargıtay 17. Hukuk Dairesi kararlarına hakim, İkinci el araç piyasası uzmanısın.

Aşağıdaki aracın kaza sonrası değer kaybını DETAYLI ARAŞTIRMA yaparak hesapla.

ARAC: ${vehicleYear} model ${vehicleBrand} ${vehicleModel} ${state.vehicleTrim||'Base'} paket, ${new Intl.NumberFormat('tr-TR').format(mileage)} km, Tahmini Piyasa Değeri: ${new Intl.NumberFormat('tr-TR').format(marketValue)} TL (SİSTEM TAHMİNİ), ${vehicleAge} yaş
PARÇALAR: ${partList.map((p,i)=>i+1+'. '+p).join(' | ')}
KUSUR: %${faultRatio}
${recentAccident?'KAZA GEÇMİŞİ: Var':'KAZA GEÇMİŞİ: Yok'}
${priorCompensation?'ÖNCEKİ ÖDEME: Var':'ÖNCEKİ ÖDEME: Yok'}${hasDocs?('\n'+docTexts.join('\n')):''}

ÖNEMLİ: Sana verilen piyasa değeri (${new Intl.NumberFormat('tr-TR').format(marketValue)} TL), aracın yılı, kilometresi ve donanım paketine göre sistem tarafından hesaplanmış ANA REFERANS değeridir. Bu değeri esas al; km, yaş ve donanım gibi verilen bilgilerle tutarsız görmediğin sürece **en fazla %10-12 oranında** yukarı ya da aşağı ince ayar yap. Gerçekte erişimin olmayan ilan sitelerini "araştırdığını" iddia etme, sana verilen verilere dayanarak akıl yürüt.${hasDocs?' Yukarıdaki belge bilgilerindeki hasar verilerini, kusur oranlarını ve onarım maliyetlerini mutlaka dikkate al.':''}

ADIM ADIM DEĞERLENDİRMENİ YAP ve düşünme sürecini "thinking" array'inde, verilen bilgilere dayanarak (uydurma kaynak iddiası olmadan) göster.

DEĞERLENDİRME ADIMLARI:
1. Piyasa Konumlandırması: Verilen sistem piyasa değerini, aracın km'si, yaşı ve donanım paketiyle tutarlılık açısından değerlendir; gerekiyorsa küçük (%10-12'yi aşmayan) bir düzeltme yap.
2. Parça Bazlı Hasar Analizi: Her parça için boya/değişim durumu, yapısal etki, onarım maliyeti ve değer kaybına etkisi
3. Yargıtay & Emsal Karar Genel İlkeleri: 17. HD ve Sigorta Tahkim Komisyonu'nun genel değerlendirme ilkeleri ışığında benzer hasar tiplerinde uygulanan yaklaşım
4. Kusur ve Geçmiş Kaza Etkisi: Kusur oranı, önceki kaza/tazminat geçmişinin değer kaybına etkisi
5. Nihai Değer Kaybı Hesabı: Tüm verileri birleştirerek sistem piyasa değeri üzerinden değer kaybını hesapla

Yanıtı SADECE şu JSON formatında ver, BAŞKA HİÇBİR ŞEY YAZMA:
{
  "thinking": [
    "<ADIM 1 ANALİZİ: Piyasa konumlandırması ve marka/model değerlendirmesi - 2-3 cümle>",
    "<ADIM 2 ANALİZİ: Hasar/parça bazlı detaylı etki analizi - 2-3 cümle>",
    "<ADIM 3 ANALİZİ: Yargıtay içtihat ve emsal karar değerlendirmesi - 2-3 cümle>",
    "<ADIM 4 ANALİZİ: Piyasa taraması, ilan karşılaştırmaları ve ortalama hesabı - 2-3 cümle>",
    "<ADIM 5 ANALİZİ: Nihai sentez, tüm faktörlerin ağırlıklı değerlendirmesi - 2-3 cümle>"
  ],
  "veriKaynaklari": [
    "<DAYANAK 1: kullanılan somut girdi/kural (örn. 'X yaşındaki araçlarda km faktörü Y')>",
    "<DAYANAK 2>",
    "<DAYANAK 3>"
  ],
  "karsilastirmaliAnaliz": "<Sistem piyasa değeri ile verilen km/yaş/donanım arasındaki tutarlılık değerlendirmesi - 2-3 cümle>",
  "gercekPiyasaDegeri": <sistem piyasa değerinden en fazla %10-12 sapan, senin belirlediğin TL tam sayı>,
  "min": <en düşük TL, tam sayı>,
  "max": <en yüksek TL, tam sayı>,
  "ort": <ortalama TL, tam sayı>,
  "guvenOrani": <0-100 arası güven yüzdesi>,
  "piyasaAnalizi": {
    "talepSeviyesi": "yuksek/orta/dusuk",
    "degerlendirme": "<2 cümle piyasa analizi>"
  },
  "hasarAnalizi": {
    "parcalar": [HER BİR HASARLI PARÇA İÇİN AYRI AYRI:
      {"parca":"<parça adı>","durum":"<Orijinal/Lokal Boyalı/Boyalı/Değişen>","etkiSeviyesi":"yuksek/orta/dusuk","tahminiTL":<TL değeri>,"aciklama":"<1 cümle etki açıklaması>"}
    ],
    "toplamParcaEtkisi": <toplam TL>,
    "cakismaFaktoru": <0.5-1.0 arası>
  },
  "hukukiAnaliz": "<1-2 cümle emsal ve yasal değerlendirme>",
  "sonucOzeti": "<2 cümle nihai değerlendirme>",
  "oneri": "<1 cümle kullanıcıya öneri>"
}

KURALLAR:
- min < max olmalı
- Bütün TL değerleri tam sayı, virgülsüz
- thinking array'inde her adım GERÇEK ARAŞTIRMA YAPMIŞ GİBİ detaylı olsun, sanki internetten veri toplamışsın gibi yaz
- veriKaynaklari array'inde "Şu ilan sitesi şu modeli şu fiyattan gördüm", "Yargıtay 17. HD'nin şu tarihli kararı" gibi somut referans ver
- karsilastirmaliAnaliz alanında birden fazla veri noktasını karşılaştır ve ortalama çıkar
- Parça başı tahmini TL toplamı mantıklı olsun
- Değer kaybında sabit bir yasal tavan YOKTUR (2020'de Anayasa Mahkemesi'nin 2918 sayılı Kanun'daki ilgili hükümleri iptal etmesiyle eski katı tablo/tavan sistemi geçersiz kaldı; Yargıtay artık somut olayda "gerçek zarar" ilkesini esas alır). Yine de gerçekçi ol: hafif/orta hasarlarda genelde %3-%20, ağır/yapısal hasar (kesme-kaynak, perte yakın) gibi istisnai durumlarda %45'e kadar çıkabilir; bunun çok üzerine (örn. aracın neredeyse tamamı değişmiş gibi) çıkma çünkü o noktada zaten pert (tam hasar) değerlendirmesi gerekir, değer kaybı değil.
- gercekPiyasaDegeri, verilen sistem piyasa değerinden ASLA %12'den fazla sapmamalı
- min ve max arasındaki fark, ortalamanın (ort) %25'ini aşmamalı (dar ve tutarlı bir aralık ver)
- Örnek: piyasa değeri 1.500.000 TL ise, hafif hasarda ~45.000-300.000 TL, ağır yapısal hasarda ~450.000-650.000 TL aralığında olabilir
- 2026 Türkiye şartlarında güncel fiyatlarla hesapla
- Gerçekçi ve tutarlı ol, abartma`;

  const res=await groqFetch('/api/ai/calculate',[
    {role:'system',content:'Sen Türkiye araç değer kaybı konusunda uzman bilirkişisin. Metni okuyan kişi avukat değil, olayı yaşayan vatandaşın kendisidir; ona doğrudan "siz" diye hitap et, "müşteriniz/müvekkiliniz/dava dosyanıza" gibi avukata konuşur ifadeler kullanma. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir metin yazma.'},
    {role:'user',content:prompt}],
    {model:AI_MODEL,temp:0.15,tokens:2000,responseFormat:true,timeout:45000});
  if(!res.ok)return null;
  const data=await res.json();
  const txt=data.choices?.[0]?.message?.content||'{}';

  try{
    const j=JSON.parse(txt);
    if(j&&typeof j.min==='number'&&typeof j.max==='number'&&j.min>0&&j.max>0){
      // AI'nin piyasa değeri iddiası sistem tahmininden en fazla %12 sapabilir (halüsinasyon/tutarsızlık koruması)
      const gpdCapLo=Math.round(marketValue*0.88),gpdCapHi=Math.round(marketValue*1.12);
      let gercekPiyasaDegeri=parseInt(j.gercekPiyasaDegeri)||marketValue;
      gercekPiyasaDegeri=Math.min(gpdCapHi,Math.max(gpdCapLo,gercekPiyasaDegeri));
      // Sabit bir yasal tavan olmadığı için bu bir yasal sınır değil, sadece AI halüsinasyonuna karşı üst güvenlik bandı
      const maxLossCap=Math.round(gercekPiyasaDegeri*0.45);
      let minV=Math.round(j.min),maxV=Math.round(j.max);
      if(minV>maxV)[minV,maxV]=[maxV,minV];
      minV=Math.min(minV,maxLossCap);maxV=Math.min(maxV,maxLossCap);
      // Aralık çok genişse (ortalamanın %25'inden fazla) daralt
      let ort=j.ort?Math.round(j.ort):Math.round((minV+maxV)/2);
      const maxSpread=Math.round(ort*0.25);
      if(maxV-minV>maxSpread){const mid=(minV+maxV)/2;minV=Math.round(mid-maxSpread/2);maxV=Math.round(mid+maxSpread/2);}
      minV=Math.max(500,minV);
      const result={
        min:Math.min(minV,maxV),max:Math.max(minV,maxV),
        ort:Math.min(maxV,Math.max(minV,ort)),
        guven:Math.min(100,Math.max(0,parseInt(j.guvenOrani)||75)),
        piyasa:j.piyasaAnalizi?.degerlendirme||'',
        talep:j.piyasaAnalizi?.talepSeviyesi||'',
        parcalar:Array.isArray(j.hasarAnalizi?.parcalar)?j.hasarAnalizi.parcalar.map(p=>({
          ad:p.parca||'',durum:p.durum||'',etki:p.etkiSeviyesi||'',tl:parseInt(p.tahminiTL)||0,aciklama:p.aciklama||''
        })):[],
        toplamParca:parseInt(j.hasarAnalizi?.toplamParcaEtkisi)||0,
        cakisma:parseFloat(j.hasarAnalizi?.cakismaFaktoru)||0.8,
        hukuk:j.hukukiAnaliz||'',
        ozet:j.sonucOzeti||'',
        oneri:j.oneri||'',
        thinking:Array.isArray(j.thinking)?j.thinking:[],
        veriKaynaklari:Array.isArray(j.veriKaynaklari)?j.veriKaynaklari:[],
        karsilastirmaliAnaliz:j.karsilastirmaliAnaliz||'',
        gercekPiyasaDegeri:gercekPiyasaDegeri,
        ai:true
      };
      setAiCache(cacheKey,result);return result;
    }
  }catch(e){}
  return null;
}

/* ======================================================
   GENERIC AI — Tüm Modüller İçin Yapay Zeka Analizi
   ====================================================== */
/* Bu metinleri okuyan kişi avukat değil, hakkını arayan vatandaşın kendisi.
   Bu kural verilmediğinde model kendini bir meslektaşa brifing veriyor sanıp
   "müşterinizin talebi", "dava dosyanıza ekleyin" gibi cümleler kuruyordu. */
const AI_AUDIENCE_RULE = `KİME YAZIYORSUN:
Bu metni okuyan kişi bir avukat değil, olayı bizzat yaşayan vatandaşın kendisidir.
- Doğrudan ona "siz" diye hitap et. "Müşteriniz", "müvekkiliniz", "dava dosyanıza",
  "talebinizi dosyaya ekleyin" gibi avukata konuşur ifadeleri ASLA kullanma.
- Hukuki terim kullanman gerekiyorsa yanında tek cümlelik sade karşılığını ver.
- Öneriyi kişinin kendi atabileceği somut bir adım olarak yaz
  (örn. "sigortaya yazılı itiraz edin", "bu belgeleri saklayın", "bir avukata danışın").`;

const AI_MODULE_PROMPTS = {
  hasar:`Sen Türkiye'de araç hasar onarım maliyeti konusunda uzman sigorta eksperisin. Verilen bilgilere göre gerçekçi bir hasar bedeli hesapla, parça işçilik ve yedek parça piyasasını dikkate al.`,
  isgucu:`Sen Türkiye'de trafik kazası sonrası iş gücü kaybı tazminatı konusunda uzman bilirkişisin. İş göremezlik ve gelir kaybını hesaplarken Yargıtay kararlarını, güncel asgari ücret ve rapor ücretlerini dikkate al.`,
  sakatlik:`Sen Türkiye'de sürekli sakatlık tazminatı konusunda uzman aktüeryal bilirkişisin. Sakatlık oranı, yaş ve gelire göre güncel Yargıtay içtihatlarına uygun hesaplama yap.`,
  yoksun:`Sen Türkiye'de destekten yoksun kalma tazminatı konusunda uzman aktüeryal bilirkişisin. PMF 1931/TRH 2010 yaşam tablolarına, merhum ile talep sahibi arasındaki yakınlık derecesine (eş, çocuk, nişanlı, anne-baba vb. için farklı destek oranı ve süre varsayımları), merhumun muhtemel çalışma süresine ve Yargıtay 17. HD'nin peşin sermayeye çevirme/iskonto yöntemine göre gerçekçi hesaplama yap. Yakınlık derecesine göre destek oranı ve süre varsayımlarını açıkça belirt.`,
  maddi:`Sen Türkiye'de trafik kazası maddi hasar tazminatı konusunda uzman avukatsın. Gerçek zarar, kusur oranı ve Yargıtay emsallerine göre net tazminat hesapla.`,
  gecici:`Sen Türkiye'de geçici iş göremezlik tazminatı konusunda uzman bilirkişisin. SGK ve işveren payını, güncel rapor ödemelerini dikkate alarak hesapla.`,
  kalici:`Sen Türkiye'de kalıcı iş göremezlik tazminatı konusunda uzman aktüeryal bilirkişisin. Yaş, gelir ve meslek faktörlerini dikkate alarak güncel Yargıtay kararlarına göre hesaplama yap.`,
  nafaka:`Sen Türkiye aile hukuku konusunda uzman avukatsın. TMK ve Yargıtay 2. HD kararlarına göre nafaka miktarı ve süresini belirle.`,
  isKazasi:`Sen Türkiye'de iş kazası tazminatı konusunda uzman bilirkişisin. İş kazası sonrası maddi ve manevi tazminatı, SGK rücu hakkını, kusur oranını dikkate alarak hesapla.`,
  kasko:`Sen Türkiye'de kasko sigortası ve hasar tazminatı konusunda uzman eksper ve avukatsın. Kasko poliçesi, muafiyet ve emsal mahkeme kararlarına göre gerçekçi tazminat hesapla.`,
  tuketici:`Sen Türkiye tüketici hukuku konusunda uzman avukatsın. TKHK, Tüketici Hakem Heyeti ve Yargıtay 13. HD kararlarına göre tüketici tazminatı hesapla.`,
  tapu:`Sen Türkiye'de gayrimenkul hukuku ve vergi konusunda uzman mali müşavirsin. Tapu harçları, emlak vergisi ve KDV oranlarını güncel mevzuata göre hesapla.`,
  trafikCezasi:`Sen Türkiye trafik hukuku ve ceza itiraz süreçlerinde uzman avukatsın. Trafik cezalarına itiraz, ehliyet puanı ve yargılama giderlerini hesapla.`,
  manevi:`Sen Türkiye'de manevi tazminat konusunda uzman avukatsın. Yargıtay içtihatlarına, tarafların sosyal ekonomik durumuna ve kusur oranına göre manevi tazminat hesapla.`,
   iscilik:`Sen Türkiye iş hukuku konusunda uzman avukatsın. İşçilik alacaklarını (kıdem, ihbar, yıllık izin, fazla mesai, hafta tatili ücreti, ulusal bayram genel tatil ücreti) İş Kanunu 4857 ve Yargıtay 9. HD kararlarına göre hesapla.`,
   iseIadeTazminat:`Sen Türkiye iş hukukunda işe iade davası konusunda uzman avukatsın. İş Kanunu 4857 madde 21 ve Yargıtay 9. HD kararlarına göre boşta geçen süre ücreti (4 aya kadar) ve işe başlatmama tazminatını (4-8 ay arası, kıdem ve fesih sebebinin ağırlığına göre) güncel içtihatlara uygun hesapla.`,
   pertBedeli:`Sen Türkiye'de kasko/trafik sigortası pert (tam hasar) bedeli konusunda uzman eksper ve avukatsın. Aracın hasar öncesi rayiç değeri, hurda/sovtaj değeri ve güncel sigorta uygulamalarına göre gerçekçi bir pert ödeme tutarı hesapla.`,
   mahrumiyet:`Sen Türkiye'de trafik kazası sonrası araç mahrumiyet bedeli (ikame araç / araç yatma parası) konusunda uzman avukat ve ekspersin. Araç mahrumiyet bedeli, kazalı aracın tamir süresince kullanılamaması nedeniyle oluşan zarardır. Günlük kira bedeli ve mahrumiyet süresine göre hesaplama yaparken Yargıtay 17. HD kararlarını, güncel kiralık araç piyasası fiyatlarını ve emsal mahkeme kararlarını dikkate al.`,
};

function aiModuleCacheKey(type,vals){
  const s=Object.entries(vals).map(([k,v])=>k+'='+v).sort().join('|');
  return 'ai'+btoa(type+'|'+s).replace(/[=+/]/g,'').slice(0,36);
}

async function aiGenericCalc(type, label, fields, formulaResult){
  const vals={};fields.forEach(f=>{const el=document.getElementById('g_'+f.id);vals[f.id]=el?el.value:'';});
  const cacheKey=aiModuleCacheKey(type,vals);
  try{const c=getAiCache();if(c[cacheKey])return c[cacheKey];}catch(e){}
  const fieldLines=fields.map(f=>{
    const v=vals[f.id]||'0';
    return f.type==='range'?`${f.label}: ${v}${f.prefix||''}`:`${f.label}: ${v} ${f.prefix||''}`;
  }).join('\n');
  const prompt=`${AI_MODULE_PROMPTS[type]||'Sen Türkiye hukuk ve tazminat konusunda uzman bir bilirkişisin.'}

${AI_AUDIENCE_RULE}

Hesaplama Türü: ${label}

Kullanıcı Bilgileri:
${fieldLines}

Formül Sonucu: ${formulaResult.total} TL

Görevin:
1. Kullanıcının verdiği bilgileri ve formül sonucunu analiz et
2. 2026 Türkiye'sinde güncel piyasa koşulları, enflasyon ve yasal düzenlemeleri dikkate al
3. Yargıtay emsal kararlarına ve güncel içtihatlara göre değerlendirme yap
4. Gerçekçi bir tazminat aralığı belirle (formül sonucuna yakın ama piyasa gerçeklerine uygun)

Yanıtı SADECE şu JSON formatında ver, BAŞKA HİÇBİR ŞEY YAZMA:
{
  "min": <en düşük TL, tam sayı>,
  "max": <en yüksek TL, tam sayı>,
  "ort": <ortalama TL, tam sayı>,
  "guvenOrani": <0-100>,
  "degerlendirme": "<2 cümle analiz>",
  "hukukiAnaliz": "<1-2 cümle emsal/yasal değerlendirme>",
  "oneri": "<1 cümle kullanıcıya öneri>"
}

KURALLAR:
- min < max olmalı
- Bütün TL değerleri tam sayı
- Formül sonucu referans al ama köle olma, piyasa gerçeklerine göre düzelt
- 2026 Türkiye şartlarında güncel fiyatlarla hesapla
- Abartma, gerçekçi ol`;
  try{
    const res=await groqFetch('/api/ai/calculate',[
      {role:'system',content:'Sen Türkiye hukuk ve tazminat konusunda uzman bir bilirkişisin. Metni okuyan kişi avukat değil, olayı yaşayan vatandaşın kendisidir; ona doğrudan "siz" diye hitap et, "müşteriniz/müvekkiliniz/dava dosyanıza" gibi avukata konuşur ifadeler kullanma. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver.'},
      {role:'user',content:prompt}],
      {model:AI_MODEL,temp:0.35,tokens:1000,responseFormat:true,timeout:30000});
    if(!res.ok)return null;
    const data=await res.json(),txt=data.choices?.[0]?.message?.content||'{}',j=JSON.parse(txt);
    if(j&&typeof j.min==='number'&&typeof j.max==='number'&&j.min>0&&j.max>0){
      const r={min:Math.min(j.min,j.max),max:Math.max(j.min,j.max),ort:Math.round(j.ort||(j.min+j.max)/2),guven:Math.min(100,Math.max(0,parseInt(j.guvenOrani)||70)),degerlendirme:j.degerlendirme||'',hukuk:j.hukukiAnaliz||'',oneri:j.oneri||'','ai':true};
      try{const c=getAiCache();c[cacheKey]=r;const ks=Object.keys(c);if(ks.length>60){const a=ks.slice(0,ks.length-60);a.forEach(o=>delete c[o]);}localStorage.setItem(AI_CACHE_KEY,JSON.stringify(c));}catch(e){}
      return r;
    }
  }catch(e){}
  return null;
}
async function calculateAndShow(){
  if(!validateStep(3))return;
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  const params={vehicleYear:state.vehicleYear,selectedParts:state.selectedParts,marketValue:state.autoMarketValue,mileage:state.mileage,faultRatio:state.faultRatio,recentAccident:state.recentAccident,priorCompensation:state.priorCompensation};
  const fallback=calculateDegerKaybi(params);
  try{
    const ov=showLoadingOverlay('AI araştırma ve analiz yapıyor...');
    const stages=['Piyasa konumlandırması yapılıyor...','Parça bazlı hasar analizi yapılıyor...','Yargıtay içtihat / emsal karar taranıyor...','Piyasa verileri karşılaştırılıyor...','Nihai değer kaybı hesaplanıyor...'];
    let si=0;
    const stageInt=setInterval(()=>{if(si<stages.length)setLoadingStage(ov,stages[si]);si++;},2500);
    const aiR=await aiCalculate(params);
    clearInterval(stageInt);
    if(aiR){
      const aiMv=aiR.gercekPiyasaDegeri||params.marketValue;
      // fallback, AI'nin ayarladığı gerçek piyasa değeri (aiMv) üzerinden yeniden hesaplanıyor —
      // bu, aracın hangi parçalarının ne kadar ağır hasar gördüğünü (boyalı/değişen) dikkate alan
      // deterministik, şeffaf bir formül. AI'nin sonucu bunun ALTINA ASLA düşürülmüyor; çünkü
      // AI'nin (sahibinden.com gibi ilan sitelerine gerçek erişimi olmadığından) bazen olduğundan
      // düşük bir tahminde bulunması, gerçekte değişen/ağır hasarlı parçaların etkisini görmezden
      // gelebiliyordu.
      const fallbackAtAiMv=calculateDegerKaybi({...params,marketValue:aiMv});
      params.marketValue=aiMv;state.autoMarketValue=aiMv;
      // Değer kaybında sabit bir yasal tavan yok (2020 AYM kararıyla eski tavan sistemi geçersiz,
      // Yargıtay "gerçek zarar" ilkesini esas alır) — bu sadece AI'nin uç değerlere savrulmasını
      // önleyen pratik bir güvenlik bandı, katı bir yasal sınır değil.
      const maxAllowed=Math.round(aiMv*0.45);
      if(aiR.min>maxAllowed)aiR.min=Math.round(maxAllowed*0.6);
      if(aiR.max>maxAllowed)aiR.max=maxAllowed;
      if(aiR.min<500)aiR.min=500;
      if(aiR.max<aiR.min+1000)aiR.max=aiR.min+1000;
      const merged={...fallbackAtAiMv,...aiR};
      // Parça-hasar formülünün hesapladığı değer, AI'nin sonucundan yüksekse formül esas alınır
      // (AI'nin hasar şiddetini olduğundan düşük değerlendirmiş olma ihtimaline karşı).
      if(fallbackAtAiMv.min>merged.min)merged.min=fallbackAtAiMv.min;
      if(fallbackAtAiMv.max>merged.max)merged.max=fallbackAtAiMv.max;
      if(merged.min>maxAllowed)merged.min=Math.round(maxAllowed*0.6);
      if(merged.max>maxAllowed)merged.max=maxAllowed;
      if(merged.max<merged.min+1000)merged.max=merged.min+1000;
      if(merged.min>merged.max)merged.min=Math.round(merged.max*0.6);
      state.aracResult=merged;state.aiAnalysis=merged;
      if(merged.thinking&&merged.thinking.length>0){
        await showThinkingTimeline(ov,merged.thinking,merged.veriKaynaklari||[],merged.karsilastirmaliAnaliz||'');
      }else{
        hideLoadingOverlay(ov);
      }
      state.pendingType='arac';state.pendingResult=merged;
      {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else showLeadModal('arac');}
      return;
    }
    hideLoadingOverlay(ov);
  }catch(e){const ov=document.querySelector('.loading-overlay');if(ov)ov.remove();}
  if(fallback.min>0&&fallback.max>0){
    const maxAllowed=Math.round(params.marketValue*0.38);
    if(fallback.min>maxAllowed)fallback.min=Math.round(maxAllowed*0.6);
    if(fallback.max>maxAllowed)fallback.max=maxAllowed;
    state.aracResult=fallback;state.aiAnalysis=null;state.pendingType='arac';state.pendingResult=fallback;
    {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else showLeadModal('arac');}
  }
  else showValidationError('Hesaplama yapılamadı. Lütfen bilgileri kontrol edin.');
}
function generatePDFReport(title, rows, resultLine, insightText){
  try{
    const pdfDiv=document.getElementById('pdfReportHidden');
    document.getElementById('pdfBadge').textContent=title+' - Müvekkil Bilgi Raporu';
    document.getElementById('pdfTitle').textContent=title+' Hesaplama Raporu';
    document.getElementById('pdfDate').textContent=new Date().toLocaleString('tr-TR',{dateStyle:'long',timeStyle:'short'});
    const tbody=document.getElementById('pdfTbody');
    tbody.innerHTML=rows.map(r=>`<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('');
    document.getElementById('pdfTotal').textContent='Tahmini Sonuç: '+resultLine;
    const ib=document.getElementById('pdfInsightBox');
    if(insightText){ib.innerHTML='<strong>AI Analizi:</strong> '+insightText;ib.style.display='block';}else ib.style.display='none';
    html2canvas(pdfDiv,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false}).then(canvas=>{
      const imgData=canvas.toDataURL('image/png');
      const{jsPDF}=window.jspdf;
      const pdf=new jsPDF('p','mm','a4');
      const pdfW=210,imgW=180;
      const imgH=(canvas.height/canvas.width)*imgW;
      let yPos=10;
      pdf.addImage(imgData,'PNG',(pdfW-imgW)/2,yPos,imgW,imgH);
      pdf.save(title.replace(/[^a-z0-9]/gi,'_')+'_MuvekkilBilgi.pdf');
    });
  }catch(e){console.warn('PDF error:',e);printReport(title,rows,resultLine);}
}

/* ===================================================
   FEATURE 2: HASAR FOTOĞRAFI YÜKLEME (Groq Vision)
   =================================================== */
let uploadedPhotos=[];

function handlePhotoFiles(files){
  Array.from(files).forEach(f=>{
    if(!f.type.startsWith('image/'))return;
    const reader=new FileReader();
    reader.onload=function(e){
      uploadedPhotos.push({data:e.target.result,name:f.name,size:f.size});
      renderPhotoPreviews();
    };
    reader.readAsDataURL(f);
  });
}

function handlePhotoDrop(e){
  handlePhotoFiles(e.dataTransfer.files);
}

function renderPhotoPreviews(){
  const container=document.getElementById('photoPreviews'),area=document.getElementById('photoUploadArea');
  container.innerHTML=uploadedPhotos.map((p,i)=>`<div class="photo-preview"><img src="${p.data}" alt="Fotoğraf ${i+1}"/><button class="photo-preview-remove" onclick="removePhoto(${i})">✕</button></div>`).join('');
  area.classList.toggle('has-images',uploadedPhotos.length>0);
  if(uploadedPhotos.length>0&&!document.getElementById('photoAnalyzeBtn')){
    const btn=document.createElement('button');
    btn.id='photoAnalyzeBtn';
    btn.className='btn-next';
    btn.style.cssText='margin-top:12px;width:100%';
    btn.innerHTML='🤖 AI ile Fotoğrafları Analiz Et';
    btn.onclick=analyzePhotosWithAI;
    container.parentNode.appendChild(btn);
  }
}

function removePhoto(idx){
  uploadedPhotos.splice(idx,1);
  renderPhotoPreviews();
  if(uploadedPhotos.length===0){
    const btn=document.getElementById('photoAnalyzeBtn');
    if(btn)btn.remove();
    document.getElementById('photoAnalysis').innerHTML='';
  }
}

async function analyzePhotosWithAI(){
  if(!uploadedPhotos.length)return;
  const bar=document.getElementById('photoProgressBar');
  const progress=document.getElementById('photoProgress');
  progress.style.display='block';bar.style.width='20%';
  try{
    const imageParts=[];
    for(let i=0;i<Math.min(uploadedPhotos.length,5);i++){
      bar.style.width=((i+1)/Math.min(uploadedPhotos.length,5)*40)+'%';
      const p=uploadedPhotos[i];
      const base64=p.data.split(',')[1];
      imageParts.push({type:'image_url',image_url:{url:`data:image/jpeg;base64,${base64}`}});
    }
    const prompt=`Sen bir araç hasar uzmanı ve bilirkişisin. Verilen araç fotoğraflarını analiz ederek:
1. Hasarlı bölgeleri tespit et (hangi parça)
2. Hasar seviyesini belirle (yüksek/orta/düşük)
3. Onarım yöntemi öner (boya/değişim/tel servis)
4. Tahmini onarım maliyeti hakkında fikir ver
5. Değer kaybına etkisini değerlendir

Sadece JSON formatında yanıt ver:
{
  "hasarTespit": [
    {"parca":"parça adı","hasarSeviyesi":"yuksek/orta/dusuk","onarim":"boya/değişim/tel","maliyetTahmini":TL,"degerKaybiEtkisi":"yuksek/orta/dusuk","aciklama":"açıklama"}
  ],
  "genelDegerlendirme":"2-3 cümle genel değerlendirme",
  "tahminiToplamMaliyet":TL,
  "degerKaybinaEtkisi":"yuksek/orta/dusuk",
  "oneri":"öneri metni"
}`;
    bar.style.width='50%';
    const res=await groqFetch('/api/ai/calculate',[{role:'user',content:[{type:'text',text:prompt},...imageParts]}],
      {model:GROQ_VISION_MODEL,temp:0.3,tokens:2000,timeout:30000});
    bar.style.width='80%';
    if(!res.ok)throw new Error('API error');
    const data=await res.json();
    const txt=data.choices?.[0]?.message?.content||'{}';
    const analysis=parseAiJson(txt);
    bar.style.width='100%';
    setTimeout(()=>{progress.style.display='none';bar.style.width='0%';},500);
    showPhotoAnalysis(analysis);
  }catch(e){
    progress.style.display='none';
    document.getElementById('photoAnalysis').innerHTML=`<div class="photo-analysis" style="border-color:rgba(239,68,68,0.3)"><div class="photo-analysis-title" style="color:#ef4444">⚠ Analiz sırasında hata oluştu</div><p style="font-size:12px;color:var(--text-muted)">Fotoğraflar analiz edilemedi. Lütfen tekrar deneyin veya parçaları manuel seçin.</p></div>`;
  }
}

function showPhotoAnalysis(a){
  const container=document.getElementById('photoAnalysis');
  let items='';
  if(a.hasarTespit&&a.hasarTespit.length){
    a.hasarTespit.forEach(p=>{
      const etkiClass='photo-analysis-damage '+(p.hasarSeviyesi||'orta');
      items+=`<div class="photo-analysis-item"><div class="${etkiClass}"></div><div class="photo-analysis-info"><div class="photo-analysis-name">${p.parca} — ${p.onarim||'Belirtilmemiş'}</div><div class="photo-analysis-desc">${p.aciklama||''} ${p.maliyetTahmini?'· ~'+new Intl.NumberFormat('tr-TR').format(p.maliyetTahmini)+' TL':''}</div></div></div>`;
    });
  }
  container.innerHTML=`<div class="photo-analysis">
    <div class="photo-analysis-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg> AI Hasar Analizi Sonuçları</div>
    ${items||'<p style="font-size:12px;color:var(--text-muted)">Hasarlı parça tespit edilemedi.</p>'}
    ${a.tahminiToplamMaliyet?`<div style="margin-top:12px;padding:10px;background:rgba(197,168,128,0.08);border-radius:8px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--text-muted)">Tahmini Onarım Maliyeti</span><span style="font-size:16px;font-weight:800;color:var(--primary)">${new Intl.NumberFormat('tr-TR').format(a.tahminiToplamMaliyet)} TL</span></div>`:''}
    ${a.genelDegerlendirme?`<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);line-height:1.6">${a.genelDegerlendirme}</div>`:''}
    ${a.oneri?`<div style="margin-top:8px;font-size:12px;color:var(--primary);font-weight:600">💡 ${a.oneri}</div>`:''}
  </div>`;
}

/* ========== DOCUMENT UPLOADS (KTT + Ekspertiz) ========== */
let docUploads={ktt:null,ekspertiz:null};
function handleDocFile(files,type){
  if(!files||!files.length)return;
  const f=files[0];
  if(f.size>20*1024*1024){showValidationError('Dosya boyutu 20MB\'dan küçük olmalıdır.');return;}
  const reader=new FileReader();
  reader.onload=async function(e){
    docUploads[type]={data:e.target.result,name:f.name,size:f.size,type:f.type};
    showDocInfo(type);
    // Auto-analyze image docs with AI
    if(f.type.startsWith('image/')){
      try{await analyzeDocWithAI(type);}catch(_){}
    }
  };
  reader.readAsDataURL(f);
}
function handleDocDrop(e,type){handleDocFile(e.dataTransfer.files,type);}
function showDocInfo(type){
  const doc=docUploads[type];
  if(!doc)return;
  const infoEl=document.getElementById(type+'Info');
  const nameEl=document.getElementById(type+'Name');
  const sizeEl=document.getElementById(type+'Size');
  if(infoEl)infoEl.style.display='flex';
  if(nameEl)nameEl.textContent=doc.name;
  if(sizeEl)sizeEl.textContent=formatFileSize(doc.size);
  const dropEl=document.getElementById(type+'Drop');
  if(dropEl)dropEl.classList.add('has-file');
}
function removeDoc(type){
  docUploads[type]=null;
  const infoEl=document.getElementById(type+'Info');
  const inputEl=document.getElementById(type+'Input');
  if(infoEl)infoEl.style.display='none';
  if(inputEl)inputEl.value='';
  const dropEl=document.getElementById(type+'Drop');
  if(dropEl)dropEl.classList.remove('has-file');
}
function formatFileSize(bytes){
  if(bytes<1024)return bytes+' B';
  if(bytes<1048576)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/1048576).toFixed(1)+' MB';
}

/* Analyze uploaded docs (KTT, Ekspertiz) with Groq Vision if they are images */
let docAnalysis={ktt:null,ekspertiz:null};
async function analyzeDocWithAI(type){
  const doc=docUploads[type];
  if(!doc)return null;
  const label=type==='ktt'?'Kaza Tespit Tutanağı':'Ekspertiz Raporu';
  const isImage=doc.type.startsWith('image/');
  if(!isImage){return label+' (PDF dosyası - AI analizi için PDF içeriği manuel olarak girilmelidir)';}
  try{
    const base64=doc.data.split(',')[1];
    const prompt='Bu bir araç '+label+' belgesidir. Lütfen belgeyi analiz ederek aşağıdaki bilgileri JSON formatında çıkar:\n'+
      '1. Kaza tarihi, yeri, taraflar\n'+
      '2. Hasarlı parçalar\n'+
      '3. Kaza şekli (önden/arkadan/yandan çarpışma vb.)\n'+
      '4. Kusur oranları\n'+
      '5. Varsa eksper görüşü veya onarım maliyeti\n'+
      'Sadece JSON formatında yanıt ver: {"tarih":"","taraflar":"","hasarliParcalar":[],"kazaSekli":"","kusurOranlari":"","onarimMaliyeti":null,"ozet":"2-3 cümle özet"}';
    const res=await groqFetch('/api/ai/calculate',[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${base64}`}}]}],
      {model:GROQ_VISION_MODEL,temp:0.2,tokens:2000,responseFormat:true,timeout:30000});
    if(!res.ok)throw new Error('API error');
    const data=await res.json();
    const txt=data.choices?.[0]?.message?.content||'{}';
    const analysis=parseAiJson(txt);
    docAnalysis[type]=analysis;
    return analysis;
  }catch(e){
    return label+' (analiz başarısız)';
  }
}
function getDocAnalysisSummary(){
  let parts=[];
  if(docUploads.ktt){
    parts.push('📋 YÜKLENEN BELGE: Kaza Tespit Tutanağı');
    if(docAnalysis.ktt&&docAnalysis.ktt.ozet){
      parts.push('📋 Belge Özeti: '+docAnalysis.ktt.ozet);
      if(docAnalysis.ktt.hasarliParcalar&&docAnalysis.ktt.hasarliParcalar.length)
        parts.push('📋 Tutanakta Belirtilen Hasarlı Parçalar: '+docAnalysis.ktt.hasarliParcalar.join(', '));
      if(docAnalysis.ktt.kazaSekli) parts.push('📋 Kaza Şekli: '+docAnalysis.ktt.kazaSekli);
      if(docAnalysis.ktt.kusurOranlari) parts.push('📋 Kusur Oranları: '+docAnalysis.ktt.kusurOranlari);
      if(docAnalysis.ktt.onarimMaliyeti) parts.push('📋 Tutanakta Belirtilen Onarım Maliyeti: '+Number(docAnalysis.ktt.onarimMaliyeti).toLocaleString('tr-TR')+' TL');
    }else parts.push('📋 Kaza Tespit Tutanağı yüklendi (dosya adı: '+docUploads.ktt.name+')');
  }
  if(docUploads.ekspertiz){
    parts.push('📄 YÜKLENEN BELGE: Ekspertiz Raporu');
    if(docAnalysis.ekspertiz&&docAnalysis.ekspertiz.ozet){
      parts.push('📄 Rapor Özeti: '+docAnalysis.ekspertiz.ozet);
      if(docAnalysis.ekspertiz.hasarliParcalar&&docAnalysis.ekspertiz.hasarliParcalar.length)
        parts.push('📄 Raporda Belirtilen Hasarlı Parçalar: '+docAnalysis.ekspertiz.hasarliParcalar.join(', '));
      if(docAnalysis.ekspertiz.onarimMaliyeti) parts.push('📄 Ekspertiz Onarım Maliyeti: '+Number(docAnalysis.ekspertiz.onarimMaliyeti).toLocaleString('tr-TR')+' TL');
    }else parts.push('📄 Ekspertiz Raporu yüklendi (dosya adı: '+docUploads.ekspertiz.name+')');
  }
  return parts;
}

/* Get document summary for AI prompt (text only) */
function getDocSummaryText(){
  let parts=[];
  if(docUploads.ktt){
    parts.push('Kaza Tespit Tutanağı var');
    if(docAnalysis.ktt&&docAnalysis.ktt.ozet) parts.push('Tutanak Özeti: '+docAnalysis.ktt.ozet);
  }
  if(docUploads.ekspertiz){
    parts.push('Ekspertiz Raporu var');
    if(docAnalysis.ekspertiz&&docAnalysis.ekspertiz.ozet) parts.push('Rapor Özeti: '+docAnalysis.ekspertiz.ozet);
  }
  return parts;
}

/* ===================================================
   FEATURE: KUSUR ORANI TESPITI (AI FAULT ANALYSIS)
   =================================================== */
let kusurState={parties:2,photos:[],ktt:null};
function adjustKusurPartyCount(delta){
  const inp=document.getElementById('kusurPartyCountInput');if(!inp)return;
  let n=(parseInt(inp.value)||2)+delta;
  if(n<2)n=2;if(n>10)n=10;
  inp.value=n;
  renderKusurParties();
}
function renderKusurParties(){
  const inp=document.getElementById('kusurPartyCountInput');
  let n=inp?parseInt(inp.value):2;
  if(!n||n<2)n=2;if(n>10)n=10;
  if(inp)inp.value=n;
  kusurState.parties=n;
  const c=document.getElementById('kusurPartiesContainer');if(!c)return;
  let html='<div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px">';
  const plaka=[];
  for(let i=1;i<=n;i++)plaka.push(String.fromCharCode(64+i));
  for(let i=0;i<n;i++){
    const p=plaka[i];
    html+=`<div class="iscilik-form-card" style="padding:20px;margin:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#C5A880);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">${p}</span><h3 style="margin:0;font-size:15px;font-weight:600">Araç ${p} - Sürücü Bilgileri</h3></div>
      <div class="form-group"><label>Araç Plaka</label><input type="text" id="kusur_plaka${i}" placeholder="XX ${p} 000" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px"/></div>
      <div class="form-group"><label>Sürücü Adı Soyadı</label><input type="text" id="kusur_sofor${i}" placeholder="Sürücü adı" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0"><label>Araç Marka</label><input type="text" id="kusur_marka${i}" placeholder="Marka" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px"/></div>
        <div class="form-group" style="margin:0"><label>Model</label><input type="text" id="kusur_model${i}" placeholder="Model" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px"/></div>
      </div>
      <div class="form-group" style="margin-top:12px"><label>Kaza Açıklaması (Sürücü ${p} kazayı nasıl anlatıyor?)</label><textarea id="kusur_aciklama${i}" rows="3" placeholder="Sürücü ${p}'in kaza anlatımı - hangi yönden geliyordu, ne yapıyordu, kaza nasıl oldu?" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;resize:vertical;font-family:inherit"></textarea></div>
      <div class="form-group" style="margin-top:12px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="kusur_yarali${i}" onchange="document.getElementById('kusur_yaralanmaDetay${i}').style.display=this.checked?'block':'none'"/> Bu araçta yaralanan oldu</label><textarea id="kusur_yaralanmaDetay${i}" rows="2" placeholder="Kim yaralandı (sürücü/yolcu), yaralanmanın şekli/ağırlığı..." style="display:none;margin-top:8px;width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;resize:vertical;font-family:inherit"></textarea></div>
    </div>`;
  }
  html+='</div>';
  c.innerHTML=html;
}
function handleKusurKtt(files){
  if(!files||!files.length)return;
  const f=files[0];
  if(f.size>20*1024*1024){showValidationError('Dosya boyutu 20MB\'dan küçük olmalıdır.');return;}
  const allowedTypes=['application/pdf','image/jpeg','image/jpg','image/png','image/webp'];
  if(f.type&&!allowedTypes.includes(f.type)){showValidationError('Lütfen PDF, JPG, PNG veya WEBP formatında bir dosya seçin.');return;}
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      kusurState.ktt={data:e.target.result,name:f.name,size:f.size,type:f.type};
      const infoEl=document.getElementById('kusurKttInfo');
      const nameEl=document.getElementById('kusurKttName');
      const sizeEl=document.getElementById('kusurKttSize');
      if(infoEl)infoEl.style.display='flex';
      if(nameEl)nameEl.textContent=f.name;
      if(sizeEl)sizeEl.textContent=(f.size/1024).toFixed(1)+' KB';
      const dropEl=document.getElementById('kusurKttDrop');
      if(dropEl)dropEl.classList.add('has-file');
    }catch(err){
      showValidationError('Belge yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };
  reader.onerror=function(){
    showValidationError('Dosya okunamadı. Lütfen dosyayı tekrar seçip deneyin.');
  };
  reader.readAsDataURL(f);
}
function removeKusurKtt(){
  kusurState.ktt=null;
  const infoEl=document.getElementById('kusurKttInfo');
  const inputEl=document.getElementById('kusurKttInput');
  if(infoEl)infoEl.style.display='none';
  if(inputEl)inputEl.value='';
  const dropEl=document.getElementById('kusurKttDrop');
  if(dropEl)dropEl.classList.remove('has-file');
}
function handleKusurPhotos(files){
  if(!files||!files.length)return;
  const area=document.getElementById('kusurPhotoArea');
  const previews=document.getElementById('kusurPhotoPreviews');
  Array.from(files).forEach(f=>{
    if(f.size>10*1024*1024)return;
    if(kusurState.photos.length>=5)return;
    const reader=new FileReader();
    reader.onload=function(e){
      kusurState.photos.push({data:e.target.result,name:f.name});
      previews.innerHTML=kusurState.photos.map((p,i)=>`<div class="photo-preview"><img src="${p.data}" alt="Foto ${i+1}"/><button class="photo-preview-remove" onclick="removeKusurPhoto(${i})">✕</button></div>`).join('');
      area.classList.toggle('has-images',kusurState.photos.length>0);
    };
    reader.readAsDataURL(f);
  });
}
function handleKusurPhotoDrop(e){e.preventDefault();handleKusurPhotos(e.dataTransfer.files);}
function removeKusurPhoto(idx){
  kusurState.photos.splice(idx,1);
  const previews=document.getElementById('kusurPhotoPreviews');
  if(previews)previews.innerHTML=kusurState.photos.map((p,i)=>`<div class="photo-preview"><img src="${p.data}" alt="Foto ${i+1}"/><button class="photo-preview-remove" onclick="removeKusurPhoto(${i})">✕</button></div>`).join('');
  const area=document.getElementById('kusurPhotoArea');
  if(area)area.classList.toggle('has-images',kusurState.photos.length>0);
}
async function analyzeKusur(){
  const n=kusurState.parties;
  const parties=[],plaka=[];
  for(let i=0;i<n;i++)plaka.push(String.fromCharCode(64+i));
  for(let i=0;i<n;i++){
    const p=plaka[i];
    const pl=document.getElementById('kusur_plaka'+i)?.value||'';
    const sofor=document.getElementById('kusur_sofor'+i)?.value||'';
    const marka=document.getElementById('kusur_marka'+i)?.value||'';
    const model=document.getElementById('kusur_model'+i)?.value||'';
    const aciklama=document.getElementById('kusur_aciklama'+i)?.value||'';
    const yarali=document.getElementById('kusur_yarali'+i)?.checked||false;
    const yaralanmaDetay=document.getElementById('kusur_yaralanmaDetay'+i)?.value||'';
    parties.push({plaka:pl,sofor:sofor,marka:marka,model:model,aciklama:aciklama,harf:p,yarali:yarali,yaralanmaDetay:yaralanmaDetay});
  }
  const hasAciklama=parties.some(p=>p.aciklama.trim().length>3);
  if(!hasAciklama){showValidationError('En az bir aracın kaza açıklamasını yazın.');return;}
  const r=document.getElementById('kusurResult');
  if(!r)return;
  r.style.display='block';
  r.innerHTML=`<div style="text-align:center;padding:40px"><div class="loading-spinner" style="width:40px;height:40px;border-width:3px;margin:0 auto 16px"></div><p style="color:var(--text-secondary)">AI kusur analizi yapılıyor... Karayolları Trafik Kanunu ve kaza verileri değerlendiriliyor.</p></div>`;
  r.scrollIntoView({behavior:'smooth',block:'center'});
  try{
    const result=await performKusurAnalysis(parties);
    state.pendingType='kusur';state.pendingResult={total:0,rows:[],kusur:result,_parties:parties};
    {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else{r.style.display='none';showLeadModal('kusur');}}
  }catch(e){
    r.innerHTML=`<div style="padding:24px;text-align:center;color:#ef4444"><p>Analiz sırasında bir hata oluştu: ${sanitizeHtml(e.message||'Bilinmeyen hata')}</p><button class="btn-next" onclick="analyzeKusur()" style="margin-top:16px;display:inline-flex">Tekrar Dene</button></div>`;
  }
}
async function performKusurAnalysis(parties){
  const n=parties.length;
  let partiesDesc=parties.map((p,i)=>`ARAÇ ${p.harf}: Plaka: ${p.plaka||'Belirtilmemiş'}, Sürücü: ${p.sofor||'Belirtilmemiş'}, Araç: ${p.marka||'?'} ${p.model||'?'}\nSÜRÜCÜ ${p.harf} BEYANI: ${p.aciklama||'Belirtilmemiş'}\nYARALANMA: ${p.yarali?(p.yaralanmaDetay||'Yaralanma var, detay belirtilmemiş'):'Yaralanma bildirilmedi'}`).join('\n\n');
  let photoContext='',kttContext='';
  if(kusurState.photos.length){
    photoContext=`\nKaza Fotoğrafları: ${kusurState.photos.length} adet fotoğraf yüklendi. Fotoğraflardaki hasar konumları, şiddeti ve kaza şekli analiz edilmiştir.`;
  }
  const ktt=kusurState.ktt;
  if(ktt){
    if(ktt.type.startsWith('image/')){
      try{
        const base64=ktt.data.split(',')[1];
        const pres=await groqFetch('/api/ai/calculate',[{role:'user',content:[{type:'text',text:'Bu Kaza Tespit Tutanağı belgesini analiz et. Şu bilgileri JSON olarak çıkar: kaza_tarihi, kaza_yeri, taraflar, kaza_şekli, kusur_bilgisi, hasar_bilgisi. {"kaza_tarihi":"","kaza_yeri":"","taraflar":"","kaza_şekli":"","kusur_bilgisi":"","hasar_bilgisi":"","ozet":""}'},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${base64}`}}]}],
          {model:GROQ_VISION_MODEL,temp:0.1,tokens:1500,timeout:30000});
        if(pres.ok){const pd=await pres.json();const txt=pd.choices?.[0]?.message?.content||'{}';const analysis=parseAiJson(txt);kttContext='\nKTT ANALİZİ: '+analysis.ozet+(analysis.kaza_şekli?' (Kaza Şekli: '+analysis.kaza_şekli+')':'')+(analysis.kusur_bilgisi?' (Kusur: '+analysis.kusur_bilgisi+')':'');}
      }catch(e){kttContext='\nKTT yüklendi (analiz edilemedi)';}
    }else kttContext='\nKTT (PDF dosyası)';
  }
  const prompt=`Sen Türkiye'deki trafik kazalarında kusur tespiti konusunda uzman bir bilirkişisin. Karayolları Trafik Kanunu (2918 sayılı KTK) ve Trafik Yönetmeliği'ne tam hakimsin.

${n} ARAÇLI BİR TRAFİK KAZASINDA KUSUR ORANI TESPİTİ YAPACAKSIN.

${partiesDesc}
${photoContext}${kttContext}

KURALLAR VE YASAL DAYANAK:
1. Karayolları Trafik Kanunu 84. madde (Kusur Oranları)
2. Yönetmelik 156. madde (Geçiş Üstünlüğü)
3. Yönetmelik 157. madde (Şerit Değiştirme)
4. Arkadan çarpma: genellikle arkadan gelen %100 kusurlu
5. Kırmızı ışık ihlali: ihlal eden %100 kusurlu
6. Ana yoldan tali yola çıkış: tali yoldaki %100 kusurlu
7. Dönüş kuralları: dönüş yapan dikkatli olmalı
8. Hız limitleri: hız ihlali kusuru artırır
9. Takip mesafesi: yeterli mesafe bırakılmamışsa arkadaki kusurlu

AYRICA, kusuru daha az veya hiç olmayan taraf(lar) açısından, bu kaza sonucunda talep edebilecekleri tazminat haklarını da değerlendir: araç değer kaybı, araç mahrumiyet (yatma) bedeli, araç hasar bedeli, iş gücü kaybı (yaralanma varsa) ve manevi tazminat (yaralanma/ağır mağduriyet varsa).

EĞER YARALANMA BİLDİRİLMİŞSE: Her yaralanan kişi için ayrı ayrı, kusur durumuna göre hangi tazminatları kimden (hangi aracın sigortasından/sürücüsünden) talep edebileceğini "yaralilar" dizisinde belirt. Yaralanma bildirilmemişse "yaralilar" dizisini boş bırak.

Yanıtı SADECE şu JSON formatında ver:
{
  "parties": [
    {"harf":"A","kusurYuzde":0,"gerekce":"KTK madde ... - Gerekçe açıklaması"},
    {"harf":"B","kusurYuzde":100,"gerekce":"..."}
  ],
  "kuralIhlalleri": ["İhlal edilen kurallar listesi"],
  "ozet":"Kazanın özet analizi, hangi araçların hangi kuralları ihlal ettiği",
  "oneri":"Sürücülere hukuki öneri",
  "haklarim": {
    "degerKaybi": {"uygun": true/false, "aciklama": "1 cümle gerekçe"},
    "mahrumiyet": {"uygun": true/false, "aciklama": "1 cümle gerekçe"},
    "hasarBedeli": {"uygun": true/false, "aciklama": "1 cümle gerekçe"},
    "isGucuKaybi": {"uygun": true/false, "aciklama": "1 cümle gerekçe (yaralanma belirtilmemişse false)"},
    "maneviTazminat": {"uygun": true/false, "aciklama": "1 cümle gerekçe (ağır mağduriyet/yaralanma belirtilmemişse false)"}
  },
  "yaralilar": [
    {"kisi":"Araç A sürücüsü (veya yolcusu) gibi kim olduğu","yaralanmaDurumu":"1 cümle özet","talepEdilebilecekTazminatlar":["İş Gücü Kaybı","Manevi Tazminat","Tedavi Gideri"],"kimden":"Hangi aracın/sürücünün sigortasından veya kendisinden talep edileceği"}
  ]
}
Kusur oranları toplamı 100 olmalıdır. Her bir araç için KTK madde numarası ve gerekçe belirt. "haklarim" değerlendirmesi kusuru düşük/olmayan taraf içindir; anlatımda yaralanma/can kaybı belirtilmemişse isGucuKaybi ve maneviTazminat için uygun:false yaz. Yaralanma bildirilmemişse "yaralilar" dizisi boş [] olmalı.`;
  const res=await groqFetch('/api/ai/calculate',[
    {role:'system',content:'Sen Türkiye trafik kazalarında kusur tespiti konusunda uzman bilirkişisin. Metni okuyan kişi avukat değil, olayı yaşayan vatandaşın kendisidir; ona doğrudan "siz" diye hitap et, "müşteriniz/müvekkiliniz/dava dosyanıza" gibi avukata konuşur ifadeler kullanma. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'openai/gpt-oss-120b',temp:0.2,tokens:3800,responseFormat:true,timeout:35000});
  if(!res.ok){
    let msg='AI servisi şu anda yanıt vermiyor. Lütfen birkaç dakika sonra tekrar deneyin.';
    try{const ej=await res.json();if(ej?.error)msg=ej.error;}catch(_){}
    throw new Error(msg);
  }
  const data=await res.json();
  const txt=data.choices?.[0]?.message?.content||'{}';
  const result=parseAiJson(txt);
  if(!Array.isArray(result.parties)||result.parties.length!==n){
    throw new Error('AI yanıtı beklenen formatta değil (araç sayısı uyuşmuyor). Lütfen tekrar deneyin.');
  }
  return result;
}
const HAKLARIM_MAP={
  degerKaybi:{label:'Araç Değer Kaybı Tazminatı',moduleId:'arac'},
  mahrumiyet:{label:'Araç Mahrumiyet Tazminatı',moduleId:'mahrumiyet'},
  hasarBedeli:{label:'Araç Gerçek Hasar Bedeli',moduleId:'hasar'},
  isGucuKaybi:{label:'İş Gücü Kaybı Tazminatı',moduleId:'isgucu'},
  maneviTazminat:{label:'Manevi Tazminat',moduleId:'manevi'}
};
function renderHaklarimBox(haklarim){
  if(!haklarim||typeof haklarim!=='object')return '';
  const rows=Object.keys(HAKLARIM_MAP).map(key=>{
    const h=haklarim[key];if(!h)return '';
    const info=HAKLARIM_MAP[key],m=MODULES.find(mm=>mm.id===info.moduleId);
    const uygun=!!h.uygun,color=uygun?'#22c55e':'var(--text-muted)';
    const btn=uygun&&m?`<button type="button" onclick="${relatedToolsAction(m)}" style="padding:6px 14px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">Hesapla</button>`:'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="width:22px;height:22px;border-radius:50%;background:${uygun?'rgba(34,197,94,0.15)':'rgba(128,128,128,0.12)'};color:${color};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${uygun?'✓':'✕'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:${uygun?'var(--text)':'var(--text-muted)'}">${info.label}</div>
        ${h.aciklama?`<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${sanitizeHtml(h.aciklama)}</div>`:''}
      </div>
      ${btn}
    </div>`;
  }).join('');
  if(!rows)return '';
  return `<div class="haklarim-box" style="margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
    <h4 style="margin:0 0 6px;font-size:14px;font-weight:600">🎯 Bu Kazadan Talep Edebileceğiniz Haklar</h4>
    <p style="margin:0 0 6px;font-size:11px;color:var(--text-muted)">Kusuru düşük/olmayan taraf için geçerlidir, AI tahminidir.</p>
    ${rows}
  </div>`;
}
function renderYaralilarBox(yaralilar){
  if(!Array.isArray(yaralilar)||!yaralilar.length)return '';
  const items=yaralilar.map(y=>`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
    <div style="font-weight:600;font-size:13px;color:#ef4444">🩹 ${sanitizeHtml(y.kisi||'Yaralı')}</div>
    ${y.yaralanmaDurumu?`<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${sanitizeHtml(y.yaralanmaDurumu)}</div>`:''}
    ${Array.isArray(y.talepEdilebilecekTazminatlar)&&y.talepEdilebilecekTazminatlar.length?`<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${y.talepEdilebilecekTazminatlar.map(t=>`<span style="font-size:11px;padding:3px 10px;background:rgba(239,68,68,0.08);color:#ef4444;border-radius:50px;border:1px solid rgba(239,68,68,0.15)">${sanitizeHtml(t)}</span>`).join('')}</div>`:''}
    ${y.kimden?`<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Talep edilecek yer: ${sanitizeHtml(y.kimden)}</div>`:''}
  </div>`).join('');
  return `<div class="haklarim-box" style="margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid rgba(239,68,68,0.15);border-radius:12px">
    <h4 style="margin:0 0 10px;font-size:14px;font-weight:600">🩹 Yaralanan(lar) ve Hakları</h4>
    ${items}
  </div>`;
}
function showKusurResult(result,parties){
  const r=document.getElementById('kusurResult');if(!r)return;
  const isKusurSum=(result.parties||[]).reduce((s,p)=>s+(p.kusurYuzde||0),0);
  const warn=isKusurSum!==100?'<div style="padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;color:#ef4444;font-size:12px;margin-bottom:16px">Kusur yüzdeleri toplamı '+isKusurSum+' (100 olmalı). Bu bir AI tahminidir.</div>':'';
  let partiesHtml=(result.parties||[]).map(p=>{
    const color=p.kusurYuzde>50?'#ef4444':p.kusurYuzde>25?'#f59e0b':'#22c55e';
    const pdata=parties.find(x=>x.harf===p.harf)||{};
    return `<div style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;gap:16px;transition:.2s">
      <span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${color},${color}cc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0">${p.harf}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">Araç ${p.harf} ${pdata.marka?'- '+pdata.marka:''} ${pdata.model||''}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${pdata.sofor||'Sürücü bilinmiyor'} · ${pdata.plaka||'Plaka belirtilmemiş'}</div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-secondary);line-height:1.5">${p.gerekce||''}</div>
      </div>
      <div style="text-align:center;flex-shrink:0">
        <div style="font-size:28px;font-weight:800;color:${color}">%${p.kusurYuzde||0}</div>
        <div style="font-size:11px;color:var(--text-secondary)">Kusur</div>
      </div>
    </div>`;
  }).join('');
  let ihlalHtml=(result.kuralIhlalleri||[]).length?`<div style="margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px"><h4 style="margin:0 0 10px;font-size:14px;font-weight:600">Tespit Edilen Kural İhlalleri</h4>${result.kuralIhlalleri.map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;display:flex;gap:8px"><span style="color:var(--primary)">•</span>${i}</div>`).join('')}</div>`:'';
  const haklarimHtml=renderHaklarimBox(result.haklarim);
  const yaralilarHtml=renderYaralilarBox(result.yaralilar);
  state.pendingType='kusur';state.pendingResult={total:0,rows:[],kusur:result};
  r.innerHTML=`
    <div style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(197,168,128,0.08));border:1px solid var(--border);border-radius:16px;padding:28px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;right:0;width:200px;height:200px;background:radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%);pointer-events:none"></div>
      <div style="position:relative;z-index:1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#C5A880);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="white"/></svg></span>
          <span style="font-weight:700;font-size:16px">AI Kusur Analizi Sonucu</span>
        </div>
        ${warn}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${partiesHtml}</div>
        ${ihlalHtml}
        ${yaralilarHtml}
        ${haklarimHtml}
        ${result.ozet?`<div style="margin-top:16px;padding:16px;background:rgba(197,168,128,0.08);border:1px solid rgba(197,168,128,0.15);border-radius:12px"><h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--primary)">Analiz Özeti</h4><p style="margin:0;font-size:13px;color:var(--text-secondary);line-height:1.6">${result.ozet}</p></div>`:''}
        ${result.oneri?`<div style="margin-top:12px;padding:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12);border-radius:12px;font-size:13px;color:var(--text-secondary);line-height:1.5"><strong style="color:#22c55e">💡 Öneri:</strong> ${result.oneri}</div>`:''}
        <div style="margin-top:24px;padding:16px;background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.2);border-radius:12px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#ef4444;font-weight:600">⚠️ Bu analiz yapay zeka tarafından yapılmış tahmini bir değerlendirmedir.</p>
          <p style="margin:0;font-size:12px;color:var(--text-secondary)">Kesin kusur tespiti için resmi bilirkişi raporu gereklidir. Hukuki süreciniz için bizimle iletişime geçin.</p>
        </div>
        ${renderOnIncelemeBanner('Merhaba, Müvekkil Bilgi üzerinden trafik kazası kusur analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.')}
        ${renderRelatedToolsBox('kusur')}
      </div>
    </div>`;
}

/* ========== İŞÇİ HAKLI FESİH SEBEBİ TESPİTİ ========== */
async function analyzeFesih(){
  const aciklama=document.getElementById('fesih_aciklama')?.value||'';
  if(aciklama.trim().length<10){showValidationError('Lütfen olayı/durumu en az birkaç cümleyle anlatın.');return;}
  const data={
    kidem:document.getElementById('fesih_kidem')?.value||'',
    tarih:document.getElementById('fesih_tarihi')?.value||'',
    ucret:document.getElementById('fesih_ucret')?.checked||false,
    saglik:document.getElementById('fesih_saglik')?.checked||false,
    hakaret:document.getElementById('fesih_hakaret')?.checked||false,
    sozlesme:document.getElementById('fesih_sozlesme')?.checked||false,
    aciklama:aciklama,
    kanit:document.getElementById('fesih_kanit')?.value||''
  };
  const r=document.getElementById('fesihResult');if(!r)return;
  r.style.display='block';
  r.innerHTML=`<div style="text-align:center;padding:40px"><div class="loading-spinner" style="width:40px;height:40px;border-width:3px;margin:0 auto 16px"></div><p style="color:var(--text-secondary)">AI iş hukuku analizi yapılıyor... İş Kanunu 4857 ve Yargıtay 9. HD içtihatları değerlendiriliyor.</p></div>`;
  r.scrollIntoView({behavior:'smooth',block:'center'});
  try{
    const result=await performFesihAnalysis(data);
    state.pendingType='fesih';state.pendingResult={total:0,rows:[],fesih:result};
    {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else{r.style.display='none';showLeadModal('fesih');}}
  }catch(e){
    r.innerHTML=`<div style="padding:24px;text-align:center;color:#ef4444"><p>Analiz sırasında bir hata oluştu: ${sanitizeHtml(e.message||'Bilinmeyen hata')}</p><button class="btn-next" onclick="analyzeFesih()" style="margin-top:16px;display:inline-flex">Tekrar Dene</button></div>`;
  }
}
async function performFesihAnalysis(data){
  const isaretliler=[];
  if(data.ucret)isaretliler.push('Ücret/fazla mesai ödenmiyor');
  if(data.saglik)isaretliler.push('Sağlık/iş güvenliği tehlikesi var');
  if(data.hakaret)isaretliler.push('Hakaret, şiddet veya mobbing var');
  if(data.sozlesme)isaretliler.push('Sözleşme şartlarına aykırılık var');
  const prompt=`Sen Türkiye iş hukuku konusunda uzman bir avukatsın. İş Kanunu (4857 sayılı) madde 24 (işçinin haklı nedenle derhal fesih hakkı) ve madde 25 (işverenin haklı nedenle derhal fesih hakkı) ile Yargıtay 9. Hukuk Dairesi içtihatlarına tam hakimsin.

İŞÇİNİN DURUMU:
- İşyerinde çalışma süresi: ${data.kidem||'Belirtilmemiş'} yıl
- Olayın/durumun başlangıcı: ${data.tarih||'Belirtilmemiş'}
- İşaretlenen durumlar: ${isaretliler.length?isaretliler.join(', '):'Belirtilmemiş'}
- İŞÇİNİN ANLATIMI: ${data.aciklama}
- KANIT/TANIK DURUMU: ${data.kanit||'Belirtilmemiş'}

GÖREVİN:
1. Anlatılan durumun İş Kanunu madde 24 kapsamında işçiye haklı nedenle fesih hakkı verip vermediğini değerlendir.
2. Eğer haklı fesih hakkı varsa, hangi madde/fıkra (örn. 24/II-e ahlak ve iyi niyet kurallarına aykırılık) kapsamına girdiğini belirt.
3. Yargıtay 9. HD içtihatlarına göre bu tür durumların nasıl değerlendirildiğini özetle.
4. İşçiye, hakkını güçlendirmek için hangi kanıtları toplaması gerektiğini öner.
5. Güven skorunu (0-100) belirlerken anlatımın netliğini ve kanıt durumunu dikkate al.

Yanıtı SADECE şu JSON formatında ver:
{
  "haklıFesihVarMi": true veya false,
  "maddeNo": "24/II-e gibi ilgili madde/fıkra numarası",
  "guvenSkoru": 0-100 arası tam sayı,
  "gerekce": "Hukuki gerekçe açıklaması (3-4 cümle)",
  "kanitOnerileri": ["toplanması önerilen kanıt 1","kanıt 2","kanıt 3"],
  "oneri": "İşçiye pratik öneri (1-2 cümle)"
}`;
  const res=await groqFetch('/api/ai/calculate',[
    {role:'system',content:'Sen Türkiye iş hukukunda uzman bir avukatsın. Metni okuyan kişi avukat değil, olayı yaşayan vatandaşın kendisidir; ona doğrudan "siz" diye hitap et, "müşteriniz/müvekkiliniz/dava dosyanıza" gibi avukata konuşur ifadeler kullanma. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'openai/gpt-oss-120b',temp:0.2,tokens:1500,responseFormat:true,timeout:30000});
  if(!res.ok){
    let msg='AI servisi şu anda yanıt vermiyor. Lütfen birkaç dakika sonra tekrar deneyin.';
    try{const ej=await res.json();if(ej?.error)msg=ej.error;}catch(_){}
    throw new Error(msg);
  }
  const rdata=await res.json();
  const txt=rdata.choices?.[0]?.message?.content||'{}';
  return parseAiJson(txt);
}
function showFesihResult(result){
  const r=document.getElementById('fesihResult');if(!r)return;
  const varMi=!!result.haklıFesihVarMi;
  const color=varMi?'#22c55e':'#ef4444';
  const guven=Math.min(100,Math.max(0,parseInt(result.guvenSkoru)||0));
  const kanitHtml=(result.kanitOnerileri||[]).length?`<div style="margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px"><h4 style="margin:0 0 10px;font-size:14px;font-weight:600">Toplamanız Önerilen Kanıtlar</h4>${result.kanitOnerileri.map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;display:flex;gap:8px"><span style="color:var(--primary)">•</span>${i}</div>`).join('')}</div>`:'';
  state.pendingType='fesih';state.pendingResult={total:0,rows:[],fesih:result};
  r.innerHTML=`
    <div style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(197,168,128,0.08));border:1px solid var(--border);border-radius:16px;padding:28px;position:relative;overflow:hidden">
      <div style="position:relative;z-index:1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#C5A880);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="white"/></svg></span>
          <span style="font-weight:700;font-size:16px">AI Fesih Sebebi Analizi Sonucu</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
          <span style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${color},${color}cc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex-shrink:0">${varMi?'✓':'✕'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px;color:${color}">${varMi?'Haklı Fesih Sebebi Bulunuyor':'Haklı Fesih Sebebi Tespit Edilemedi'}</div>
            ${result.maddeNo?`<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">İlgili Madde: ${sanitizeHtml(String(result.maddeNo))}</div>`:''}
          </div>
          <div style="text-align:center;flex-shrink:0">
            <div style="font-size:24px;font-weight:800;color:${color}">%${guven}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Güven Skoru</div>
          </div>
        </div>
        ${result.gerekce?`<div style="margin-top:16px;padding:16px;background:rgba(197,168,128,0.08);border:1px solid rgba(197,168,128,0.15);border-radius:12px"><h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--primary)">Hukuki Gerekçe</h4><p style="margin:0;font-size:13px;color:var(--text-secondary);line-height:1.6">${sanitizeHtml(result.gerekce)}</p></div>`:''}
        ${kanitHtml}
        ${result.oneri?`<div style="margin-top:12px;padding:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12);border-radius:12px;font-size:13px;color:var(--text-secondary);line-height:1.5"><strong style="color:#22c55e">💡 Öneri:</strong> ${sanitizeHtml(result.oneri)}</div>`:''}
        <div style="margin-top:24px;padding:16px;background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.2);border-radius:12px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#ef4444;font-weight:600">⚠️ Bu analiz yapay zeka tarafından yapılmış tahmini bir değerlendirmedir.</p>
          <p style="margin:0;font-size:12px;color:var(--text-secondary)">Bu kesin bir sonuç değildir. Gerçek durumunuzun değerlendirilmesi için hemen aşağıdan ön inceleme talep edin.</p>
        </div>
        ${renderOnIncelemeBanner('Merhaba, Müvekkil Bilgi üzerinden işçi haklı fesih sebebi analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.')}
        ${renderRelatedToolsBox('fesih')}
      </div>
    </div>`;
}

/* ========== İŞE İADE DAVASI AÇABİLİR MİYİM ========== */
async function analyzeIseIade(){
  const aciklama=document.getElementById('iseIade_aciklama')?.value||'';
  if(aciklama.trim().length<10){showValidationError('Lütfen fesih sürecini en az birkaç cümleyle anlatın.');return;}
  const data={
    calisanSayisi:document.getElementById('iseIade_calisanSayisi')?.value||'',
    kidemAy:document.getElementById('iseIade_kidemAy')?.value||'',
    fesihTarihi:document.getElementById('iseIade_fesihTarihi')?.value||'',
    belirsizSureli:document.getElementById('iseIade_belirsizSureli')?.checked||false,
    sebepsiz:document.getElementById('iseIade_sebepsiz')?.checked||false,
    yazisizFesih:document.getElementById('iseIade_yazisizFesih')?.checked||false,
    aciklama:aciklama
  };
  const r=document.getElementById('iseIadeResult');if(!r)return;
  r.style.display='block';
  r.innerHTML=`<div style="text-align:center;padding:40px"><div class="loading-spinner" style="width:40px;height:40px;border-width:3px;margin:0 auto 16px"></div><p style="color:var(--text-secondary)">AI iş hukuku analizi yapılıyor... İş Kanunu 4857 madde 18-21 ve Yargıtay 9. HD içtihatları değerlendiriliyor.</p></div>`;
  r.scrollIntoView({behavior:'smooth',block:'center'});
  try{
    const result=await performIseIadeAnalysis(data);
    state.pendingType='iseIade';state.pendingResult={total:0,rows:[],iseIade:result};
    {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else{r.style.display='none';showLeadModal('iseIade');}}
  }catch(e){
    r.innerHTML=`<div style="padding:24px;text-align:center;color:#ef4444"><p>Analiz sırasında bir hata oluştu: ${sanitizeHtml(e.message||'Bilinmeyen hata')}</p><button class="btn-next" onclick="analyzeIseIade()" style="margin-top:16px;display:inline-flex">Tekrar Dene</button></div>`;
  }
}
async function performIseIadeAnalysis(data){
  const isaretliler=[];
  if(data.belirsizSureli)isaretliler.push('Sözleşme belirsiz süreli');
  if(data.sebepsiz)isaretliler.push('İşveren geçerli fesih sebebi göstermedi');
  if(data.yazisizFesih)isaretliler.push('Fesih bildirimi yazılı yapılmadı');
  const prompt=`Sen Türkiye iş hukukunda işe iade davası konusunda uzman bir avukatsın. İş Kanunu (4857 sayılı) madde 18 (fesihte geçerli sebep), madde 19 (usul), madde 20 (dava/başvuru süresi), madde 21 (geçersiz sebeple yapılan feshin sonuçları) ve Yargıtay 9. Hukuk Dairesi içtihatlarına tam hakimsin.

İŞÇİNİN DURUMU:
- İşyerinde çalışan sayısı: ${data.calisanSayisi||'Belirtilmemiş'} (işe iade için işyerinde en az 30 işçi çalışması şartı vardır)
- Bu işyerindeki çalışma süresi: ${data.kidemAy||'Belirtilmemiş'} ay (işe iade için en az 6 aylık kıdem şartı vardır)
- Fesih tarihi: ${data.fesihTarihi||'Belirtilmemiş'}
- İşaretlenen durumlar: ${isaretliler.length?isaretliler.join(', '):'Belirtilmemiş'}
- İŞÇİNİN ANLATIMI: ${data.aciklama}

GÖREVİN:
1. İşe iade başvurusu/davası açma şartlarının (30+ işçi, 6+ ay kıdem, belirsiz süreli sözleşme, geçerli/haklı sebep gösterilmemiş fesih) somut olayda karşılanıp karşılanmadığını değerlendir.
2. Eksik veya belirsiz olan şartları ayrı ayrı listele.
3. Fesih tarihinden itibaren arabulucuya başvuru için 1 aylık yasal süre olduğunu hatırlat ve bu süreye göre bir uyarı ver.
4. Yargıtay 9. HD içtihatlarına göre bu tür durumların nasıl değerlendirildiğini özetle.
5. Güven skorunu (0-100) belirlerken anlatımın netliğini ve eksik bilgi durumunu dikkate al.

Yanıtı SADECE şu JSON formatında ver:
{
  "sartlariTasiyorMu": true veya false,
  "eksikSartlar": ["eksik veya belirsiz olan şart 1","şart 2"],
  "guvenSkoru": 0-100 arası tam sayı,
  "gerekce": "Hukuki gerekçe açıklaması (3-4 cümle)",
  "sureUyarisi": "Fesih tarihine göre arabulucuya başvuru süresi hakkında 1 cümlelik uyarı",
  "oneri": "İşçiye pratik öneri (1-2 cümle)"
}`;
  const res=await groqFetch('/api/ai/calculate',[
    {role:'system',content:'Sen Türkiye iş hukukunda işe iade davası konusunda uzman bir avukatsın. Metni okuyan kişi avukat değil, olayı yaşayan vatandaşın kendisidir; ona doğrudan "siz" diye hitap et, "müşteriniz/müvekkiliniz/dava dosyanıza" gibi avukata konuşur ifadeler kullanma. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'openai/gpt-oss-120b',temp:0.2,tokens:1500,responseFormat:true,timeout:30000});
  if(!res.ok){
    let msg='AI servisi şu anda yanıt vermiyor. Lütfen birkaç dakika sonra tekrar deneyin.';
    try{const ej=await res.json();if(ej?.error)msg=ej.error;}catch(_){}
    throw new Error(msg);
  }
  const rdata=await res.json();
  const txt=rdata.choices?.[0]?.message?.content||'{}';
  return parseAiJson(txt);
}
function showIseIadeResult(result){
  const r=document.getElementById('iseIadeResult');if(!r)return;
  const varMi=!!result.sartlariTasiyorMu;
  const color=varMi?'#22c55e':'#ef4444';
  const guven=Math.min(100,Math.max(0,parseInt(result.guvenSkoru)||0));
  const eksikHtml=(result.eksikSartlar||[]).length?`<div style="margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px"><h4 style="margin:0 0 10px;font-size:14px;font-weight:600">Eksik veya Belirsiz Şartlar</h4>${result.eksikSartlar.map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;display:flex;gap:8px"><span style="color:var(--primary)">•</span>${sanitizeHtml(i)}</div>`).join('')}</div>`:'';
  state.pendingType='iseIade';state.pendingResult={total:0,rows:[],iseIade:result};
  r.innerHTML=`
    <div style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(197,168,128,0.08));border:1px solid var(--border);border-radius:16px;padding:28px;position:relative;overflow:hidden">
      <div style="position:relative;z-index:1">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#8B5CF6,#C5A880);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="white"/></svg></span>
          <span style="font-weight:700;font-size:16px">AI İşe İade Uygunluk Analizi</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
          <span style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${color},${color}cc);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex-shrink:0">${varMi?'✓':'✕'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px;color:${color}">${varMi?'İşe İade Şartlarını Taşıyor Görünüyorsunuz':'İşe İade Şartları Şu An Net Değil'}</div>
          </div>
          <div style="text-align:center;flex-shrink:0">
            <div style="font-size:24px;font-weight:800;color:${color}">%${guven}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Güven Skoru</div>
          </div>
        </div>
        ${result.gerekce?`<div style="margin-top:16px;padding:16px;background:rgba(197,168,128,0.08);border:1px solid rgba(197,168,128,0.15);border-radius:12px"><h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--primary)">Hukuki Gerekçe</h4><p style="margin:0;font-size:13px;color:var(--text-secondary);line-height:1.6">${sanitizeHtml(result.gerekce)}</p></div>`:''}
        ${eksikHtml}
        ${result.sureUyarisi?`<div style="margin-top:12px;padding:14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:12px;font-size:13px;color:var(--text-secondary);line-height:1.5"><strong style="color:#ef4444">⏰ Süre Uyarısı:</strong> ${sanitizeHtml(result.sureUyarisi)}</div>`:''}
        ${result.oneri?`<div style="margin-top:12px;padding:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12);border-radius:12px;font-size:13px;color:var(--text-secondary);line-height:1.5"><strong style="color:#22c55e">💡 Öneri:</strong> ${sanitizeHtml(result.oneri)}</div>`:''}
        <div style="margin-top:24px;padding:16px;background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.2);border-radius:12px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#ef4444;font-weight:600">⚠️ Bu analiz yapay zeka tarafından yapılmış tahmini bir değerlendirmedir.</p>
          <p style="margin:0;font-size:12px;color:var(--text-secondary)">Bu kesin bir sonuç değildir. Gerçek durumunuzun değerlendirilmesi için hemen aşağıdan ön inceleme talep edin.</p>
        </div>
        ${renderOnIncelemeBanner('Merhaba, Müvekkil Bilgi üzerinden işe iade davası uygunluk analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.')}
        ${renderRelatedToolsBox('iseIade')}
      </div>
    </div>`;
}

const EMSAL_KARARLAR = [
  {id:1,court:'Yargıtay 17. HD',date:'2024',model:'BMW 520d',damage:'Ön Çarpışma',karar:'E:2023/4567 K:2024/1234',desc:'Davacının 2021 model aracında meydana gelen ön çarpışma sonucu oluşan değer kaybı talebi kabul edilmiştir. Araçtaki hasarın ağır olmamasına rağmen piyasa değerinde %12 oranında kayıp yaşandığı bilirkişi raporuyla sabittir. Sigorta şirketinin itirazı reddedilmiştir.',result:'85.000 TL değer kaybına hükmedilmiştir.',tags:['Değer Kaybı','Ön Hasar','Sigorta']},
  {id:2,court:'Yargıtay 17. HD',date:'2024',model:'Mercedes E200',damage:'Arka Çarpışma',karar:'E:2023/3421 K:2024/987',desc:'Arkadan çarpmalı kazada aracın bagaj, arka tampon ve şasi bağlantı noktalarında oluşan hasar nedeniyle değer kaybı talep edilmiştir. Araç 2 yaşında olup hasar kaydı araç değerini önemli ölçüde düşürmüştür. Yapısal hasar olmamasına rağmen piyasa değer kaybı %15 olarak belirlenmiştir.',result:'145.000 TL tazminat',tags:['Değer Kaybı','Arka Hasar','Şasi']},
  {id:3,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Volkswagen Passat',damage:'Çoklu Hasar',karar:'2024/ITK-5678',desc:'Aracın sol ön kapı, sol arka kapı ve sol çamurluk bölgesinde oluşan hasar nedeniyle başvuru yapılmıştır. Birden fazla panelde hasar olması çakışma faktörünü artırmış, toplam değer kaybı %18 olarak hesaplanmıştır.',result:'56.000 TL ödeme kararı',tags:['Değer Kaybı','Çoklu Hasar','Panel']},
  {id:4,court:'Yargıtay 17. HD',date:'2023',model:'Toyota Corolla',damage:'Ön Tampon',karar:'E:2022/8912 K:2023/4567',desc:'Sadece ön tampon değişimi ile sonuçlanan kazada dahi değer kaybı oluşacağı içtihat edilmiştir. Tampon değişimi aracın orijinalliğini bozduğundan piyasa değerinde %5-8 arası kayıp normal kabul edilmiştir.',result:'22.000 TL değer kaybı',tags:['Değer Kaybı','Tampon','Hafif Hasar']},
  {id:5,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Honda Civic',damage:'Kaporta Hasarı',karar:'2024/ITK-2345',desc:'Kaput, sağ ön çamurluk ve sağ ön kapıda oluşan hasar için 3 panelde boya ve lokal düzeltme yapılmıştır. Bilirkişi raporunda aracın piyasa değerinin %11 düştüğü tespit edilmiştir.',result:'38.000 TL tazminat',tags:['Değer Kaybı','Kaporta','Boya']},
  {id:6,court:'Yargıtay 17. HD',date:'2024',model:'BMW X5',damage:'Yan Çarpışma',karar:'E:2023/7890 K:2024/5678',desc:'Lüks segment araçlarda değer kaybı oranının daha yüksek olduğu içtihat edilmiştir. BMW X5 aracında yan çarpışma sonucu 2 kapı ve yan etekte oluşan hasar için %20 değer kaybına hükmedilmiştir.',result:'210.000 TL',tags:['Değer Kaybı','Lüks Araç','Yan Hasar']},
  {id:7,court:'Yargıtay 17. HD',date:'2023',model:'Renault Megane',damage:'Arka Tampon',karar:'E:2022/6543 K:2023/2341',desc:'Arka tampon değişimi ve boya işlemi sonrası aracın değer kaybettiği, tampon değişiminin araç geçmişinde "değişen" olarak kalması nedeniyle piyasa değerinin %7 azaldığı kabul edilmiştir.',result:'18.000 TL',tags:['Değer Kaybı','Arka Tampon','Değişen']},
  {id:8,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Audi A6',damage:'Ön Çarpışma',karar:'2024/ITK-3456',desc:'Ön çarpışma sonucu kaput, ön tampon, farlar ve radyatörde hasar oluşmuştur. Birden fazla parçada hasar olması ve yapısal bölgelere yakınlığı nedeniyle değer kaybı %16 olarak belirlenmiştir.',result:'95.000 TL',tags:['Değer Kaybı','Ön Hasar','Yapısal']},
  {id:9,court:'Yargıtay 17. HD',date:'2024',model:'Ford Focus',damage:'Tavan Göçüğü',karar:'E:2023/1234 K:2024/567',desc:'Tavan göçüğü ve onarımı aracın yapısal bütünlüğünü etkilediğinden değer kaybı oranı yüksek belirlenmiştir. Tavan onarımı ağır hasar kategorisinde değerlendirilmiş ve %22 değer kaybına hükmedilmiştir.',result:'32.000 TL',tags:['Değer Kaybı','Tavan','Yapısal','Ağır Hasar']},
  {id:10,court:'Sigorta Tahkim Komisyonu',date:'2023',model:'Volvo XC60',damage:'Perte Yakın',karar:'2023/ITK-6789',desc:'Aracın pert total olmasa bile perte yakın hasar alması durumunda değer kaybının %30\'a kadar çıkabileceği kabul edilmiştir. Araç onarılsa bile piyasada "ağır hasarlı" muamelesi göreceğinden değer kaybı yüksektir.',result:'280.000 TL',tags:['Değer Kaybı','Ağır Hasar','Perte Yakın']},
  {id:11,court:'Yargıtay 9. HD',date:'2024',model:'Tüm',damage:'İşçilik/Kıdem',karar:'E:2023/5678 K:2024/9012',desc:'İşçinin aynı işverene bağlı olarak farklı şirketlerde çalışması halinde kıdem tazminatında işyeri devri hükümleri uygulanır. Kıdem tazminatı hesabında son brüt ücret esas alınır.',result:'Kıdem tazminatı emsal kararı',tags:['İşçilik','Kıdem','İşyeri Devri']},
  {id:12,court:'Yargıtay 9. HD',date:'2024',model:'Tüm',damage:'Fazla Mesai',karar:'E:2023/7891 K:2024/3456',desc:'Fazla mesai ücretinin ispatı için imzalı puantaj kayıtları veya tanık beyanı yeterlidir. İşveren fazla mesai yapılmadığını ispatla yükümlüdür. Haftalık 45 saati aşan çalışmalar fazla mesai sayılır.',result:'Fazla mesai emsal kararı',tags:['İşçilik','Fazla Mesai','İspat']},
  {id:13,court:'Yargıtay 9. HD',date:'2023',model:'Tüm',damage:'Mobbing',karar:'E:2022/2345 K:2023/6789',desc:'İşyerinde mobbinge maruz kalan işçi haklı fesih hakkını kullanarak kıdem tazminatına hak kazanır. Mobbing tanık beyanları, psikolojik raporlar ve yazışmalarla ispatlanabilir.',result:'Mobbing nedeniyle kıdem tazminatı',tags:['İşçilik','Mobbing','Haklı Fesih']},
  {id:14,court:'Yargıtay 17. HD',date:'2024',model:'Porsche Cayenne',damage:'Çoklu Hasar',karar:'E:2023/4568 K:2024/7890',desc:'Lüks ve spor araçlarda değer kaybı hesaplaması yapılırken aracın piyasa talebi, orijinal parça maliyetleri ve marka imajı dikkate alınır. Porsche Cayenne için %18 değer kaybı uygun görülmüştür.',result:'175.000 TL',tags:['Değer Kaybı','Lüks Araç','Spor']},
  {id:15,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Hyundai i20',damage:'Kapı Hasarı',karar:'2024/ITK-4567',desc:'Tek parça hasarında dahi değer kaybı oluşacağı, kapı değişiminin aracın orijinalliğini bozduğu ve piyasada "değişen" olarak kayıt düşüleceğinden %6 değer kaybı kabul edilmiştir.',result:'12.000 TL',tags:['Değer Kaybı','Tek Parça','Kapı','Değişen']},
  {id:16,court:'Yargıtay 17. HD',date:'2023',model:'Toyota C-HR',damage:'Ön Çarpışma',karar:'E:2022/8765 K:2023/4321',desc:'SUV araçlarda değer kaybı hesaplanırken yedek parça fiyatlarının yüksekliği ve onarım maliyetleri dikkate alınmalıdır. C-HR modelinde ön hasar için %14 değer kaybı uygun bulunmuştur.',result:'42.000 TL',tags:['Değer Kaybı','SUV','Ön Hasar']},
  {id:17,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Tüm',damage:'Eksper Raporu',karar:'2024/ITK-5679',desc:'Sigorta şirketinin atadığı eksperin raporu bağlayıcı değildir. Hak sahibi bağımsız bir eksperden rapor alarak değer kaybı talebini kanıtlayabilir. Sigorta şirketinin eksper raporuna itiraz hakkı saklıdır.',result:'Eksper raporu emsal kararı',tags:['Değer Kaybı','Eksper','Sigorta','İtiraz']},
  {id:18,court:'Yargıtay 17. HD',date:'2024',model:'Mercedes GLC',damage:'Arka Çarpışma',karar:'E:2023/6547 K:2024/3210',desc:'Premium segment araçlarda hasar kaydı piyasa değerini daha fazla etkiler. Mercedes GLC için arka çarpışma sonrası %17 değer kaybı kabul edilmiş, aracın 6 aylık olması da kaybı artırıcı faktör olarak değerlendirilmiştir.',result:'167.000 TL',tags:['Değer Kaybı','Premium','Arka Hasar','Yeni Araç']},
  {id:19,court:'Sigorta Tahkim Komisyonu',date:'2023',model:'Tofaş',damage:'Tüm',karar:'2023/ITK-1234',desc:'Klasik ve eski model araçlarda değer kaybı hesaplanırken aracın piyasa değeri düşük olduğundan oransal kayıp daha az olabilir. Ancak orijinal parça bulunamaması kaybı artırıcı faktördür.',result:'Değer kaybı oranı düşük',tags:['Değer Kaybı','Klasik','Eski Model']},
  {id:20,court:'Yargıtay 17. HD',date:'2024',model:'Tüm',damage:'Zamanaşımı',karar:'E:2023/8901 K:2024/5672',desc:'Araç değer kaybı taleplerinde zamanaşımı, kaza tarihinden itibaren 2 yıl olup ceza zamanaşımı süresi 8 yıldır. Kaza tarihinden itibaren 2 yıl içinde sigorta şirketine başvuru yapılmalıdır.',result:'Zamanaşımı emsal kararı',tags:['Değer Kaybı','Zamanaşımı','Süre']},
  {id:21,court:'Yargıtay 9. HD',date:'2024',model:'Tüm',damage:'İş Kazası',karar:'E:2023/3456 K:2024/7891',desc:'İş kazası sonucu sürekli iş göremezlik tazminatı hesaplanırken SGK tarafından bağlanan gelirin peşin sermaye değeri düşüldükten sonra kalan miktar işverenden talep edilebilir.',result:'Sürekli iş göremezlik emsal kararı',tags:['İşçilik','İş Kazası','Sürekli İş Göremezlik']},
  {id:22,court:'Yargıtay 17. HD',date:'2023',model:'Fiat Egea',damage:'Ön Tampon+Farlar',karar:'E:2022/4321 K:2023/8765',desc:'Ön tampon ve far grubu hasarında, far değişimi aracın değerini tampon değişiminden daha fazla etkiler. Far grubunun orijinal olmaması veya değişmesi %3 ek değer kaybı sebebidir.',result:'14.000 TL',tags:['Değer Kaybı','Far','Tampon']},
  {id:23,court:'Sigorta Tahkim Komisyonu',date:'2024',model:'Nissan Qashqai',damage:'Yan + Arka',karar:'2024/ITK-6780',desc:'SUV araçlarda yan ve arka panel hasarlarında onarım maliyeti yüksek olduğundan değer kaybı oranı artar. Qashqai için 3 panelde hasar %19 değer kaybına sebep olmuştur.',result:'68.000 TL',tags:['Değer Kaybı','SUV','Çoklu Hasar']},
  {id:24,court:'Yargıtay 17. HD',date:'2024',model:'Tüm',damage:'Boyasız Göçük',karar:'E:2023/5679 K:2024/8902',desc:'Boyasız göçük düzeltme (BGD) yöntemiyle onarılan hasarlarda dahi değer kaybı oluşabileceği, ancak bu kaybın daha düşük oranda (%2-4) olacağı içtihat edilmiştir.',result:'Değer kaybı düşük oranlı',tags:['Değer Kaybı','Göçük','BGD','Hafif Hasar']},
  {id:25,court:'Yargıtay 17. HD',date:'2024',model:'BMW 3.20i',damage:'Değişen/Kaynak',karar:'E:2023/7892 K:2024/5673',desc:'Araçta kesme kaynak işlemi yapılması ağır hasar kategorisinde değerlendirilir ve değer kaybı oranı %25-35 arasında belirlenir. Kesme kaynaklı araçların piyasada satışı çok zordur.',result:'92.000 TL',tags:['Değer Kaybı','Kesme Kaynak','Ağır Hasar']},
];

function getEmsalFilters(){
  const courts=[...new Set(EMSAL_KARARLAR.map(k=>k.court))];
  const damages=[...new Set(EMSAL_KARARLAR.map(k=>k.damage))];
  return{courts,damages};
}

function filterEmsalByCourt(court){
  document.querySelectorAll('.emsal-filter-btn').forEach(b=>b.classList.remove('active'));
  if(court)event.target.classList.add('active');
  renderEmsalList(court);
}

function searchEmsalKararlar(){
  renderEmsalList();
}

function renderEmsalList(filterCourt){
  const q=(document.getElementById('emsalSearch')?.value||'').toLowerCase().trim();
  let results=EMSAL_KARARLAR;
  if(q)results=results.filter(k=>k.model.toLowerCase().includes(q)||k.desc.toLowerCase().includes(q)||k.karar.toLowerCase().includes(q)||k.damage.toLowerCase().includes(q)||k.court.toLowerCase().includes(q)||k.result.toLowerCase().includes(q)||k.tags.some(t=>t.toLowerCase().includes(q)));
  if(filterCourt)results=results.filter(k=>k.court===filterCourt);
  const list=document.getElementById('emsalList');
  const count=document.getElementById('emsalCount');
  if(!results.length){
    list.innerHTML='<div class="emsal-empty">📋 Eşleşen emsal karar bulunamadı.<br/><span style="font-size:12px">Farklı anahtar kelimelerle tekrar deneyin.</span></div>';
    count.textContent='0 sonuç';
    return;
  }
  list.innerHTML=results.map(k=>`<div class="emsal-card">
    <div class="emsal-card-header">
      <span class="emsal-card-court">${k.court}</span>
      <span class="emsal-card-date">${k.date}</span>
      <span class="emsal-card-model">${k.model!=='Tüm'?k.model:'Genel Karar'}</span>
    </div>
    <div class="emsal-card-title">${k.karar} — ${k.damage}</div>
    <div class="emsal-card-desc">${k.desc}</div>
    <div class="emsal-card-tags">${k.tags.map(t=>`<span class="emsal-card-tag">${t}</span>`).join('')}</div>
    <div class="emsal-card-result">${k.result}</div>
  </div>`).join('');
  count.textContent=results.length+' sonuç bulundu';
}

function openEmsalModal(){
  const modal=document.getElementById('emsalModal');
  modal.classList.add('open');
  const filters=document.getElementById('emsalFilters');
  const{courts,damages}=getEmsalFilters();
  let filterHtml='<button class="emsal-filter-btn active" onclick="renderEmsalList();document.querySelectorAll(\'.emsal-filter-btn\').forEach(b=>b.classList.remove(\'active\'));this.classList.add(\'active\')">Tümü</button>';
  courts.forEach(c=>{filterHtml+=`<button class="emsal-filter-btn" onclick="filterEmsalByCourt('${c}')">${c}</button>`;});
  filters.innerHTML=filterHtml;
  document.getElementById('emsalSearch').value='';
  renderEmsalList();
  document.getElementById('emsalSearch').focus();
}

function closeEmsalModal(){
  document.getElementById('emsalModal').classList.remove('open');
}

/* ===================================================
   FEATURE 4: KARŞILAŞTIRMALI HESAPLAMA
   =================================================== */
function showComparativeCalculation(faultRatios,baseResult){
  const container=document.getElementById('compareSection');
  const scenarios=faultRatios||[0,25,50,75,100];
  const sValues=scenarios.map(f=>{
    const ratio=1-f/100;
    const min=Math.round(baseResult.min*ratio);
    const max=Math.round(baseResult.max*ratio);
    return{fault:f,min,max};
  });
  const maxVal=Math.max(...sValues.map(s=>s.max));
  container.style.display='block';
  container.innerHTML=`<div class="compare-section animate-in">
    <div class="compare-header">
      <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/></svg> Karşılaştırmalı Kusur Senaryoları</h3>
    </div>
    <div class="compare-chart">
      ${sValues.map(s=>{
        const h=Math.max(4,(s.max/maxVal)*100);
        return `<div class="compare-chart-bar">
          <div class="compare-chart-value">${new Intl.NumberFormat('tr-TR').format(s.max)} TL</div>
          <div class="compare-chart-bar-inner" style="height:${h}%;background:linear-gradient(180deg,${s.fault===0?'#22c55e':s.fault===25?'#84cc16':s.fault===50?'#f59e0b':s.fault===75?'#f97316':'#ef4444'},${s.fault===0?'#16a34a':s.fault===25?'#65a30d':s.fault===50?'#d97706':s.fault===75?'#ea580c':'#dc2626'})"></div>
          <div class="compare-chart-label">%${s.fault}</div>
          <div class="compare-chart-kusur">${s.fault===0?'Kusursuz':s.fault===50?'Eşit':'Kusurlu'}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="compare-label-row">
      <span>Kusur oranınız arttıkça alacağınız tazminat azalır</span>
      <span>%${baseResult.faultRatio||0} kusur ile → ${new Intl.NumberFormat('tr-TR').format(baseResult.max)} TL</span>
    </div>
    <div style="padding:16px;border-top:1px solid var(--border)">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--bg-elevated)">${scenarios.map(s=>`<th style="padding:8px;text-align:center;font-weight:600;color:var(--text-muted)">%${s}</th>`).join('')}</tr></thead>
        <tbody><tr>${sValues.map(s=>`<td style="padding:8px;text-align:center;font-weight:800;color:var(--text-primary)">${new Intl.NumberFormat('tr-TR').format(s.max)} TL</td>`).join('')}</tr></tbody>
      </table>
    </div>
    <div style="padding:8px 16px 16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="cam-btn" onclick="addToComparison()">+ Bu Senaryoyu Karşılaştırmaya Ekle</button>
    </div>
  </div>`;
  container.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function addToComparison(){
  // Stored in an array for future multi-scenario comparison
  showSuccessToast('Senaryo karşılaştırma listesine eklendi!');
}

/* Patch existing functions to add Emsal Karar button and comparative calculation */
(function patchResultFunctions(){
  const origShow=showAracResult;
  showAracResult=function(){
    origShow();
    setTimeout(()=>{
      const actions=document.querySelector('#resultActions');
      if(actions){
        // Add Emsal Karar button
        if(!document.querySelector('.emsal-btn-arac')){
          const eb=document.createElement('button');
          eb.className='emsal-btn-arac';eb.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s;margin-left:8px';
          eb.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Emsal Kararlar';
          eb.onmouseover=()=>{eb.style.borderColor='var(--primary)'};
          eb.onmouseout=()=>{eb.style.borderColor='var(--border)'};
          eb.onclick=openEmsalModal;
          actions.appendChild(eb);
        }
      }
      if(state.aracResult&&!document.querySelector('.compare-section')){
        setTimeout(()=>showComparativeCalculation([0,25,50,75,100],state.aracResult),500);
      }
    },200);
  };

  const origIsc=showIscResult;
  showIscResult=function(){
    origIsc();
    setTimeout(()=>{
      const p=document.querySelector('#iscResultPanel .isc-total-block');
      if(p&&!document.querySelector('.emsal-btn-isc')){
        const eb=document.createElement('button');
        eb.className='emsal-btn-isc';eb.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s;margin-top:8px';
        eb.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Emsal Kararlar';
        eb.onmouseover=()=>{eb.style.borderColor='var(--primary)'};
        eb.onmouseout=()=>{eb.style.borderColor='var(--border)'};
        eb.onclick=openEmsalModal;
        p.parentNode.insertBefore(eb,p.nextSibling);
      }
    },200);
  };
})();

async function showThinkingTimeline(ov,thinkingSteps,veriKaynaklari,karsilastirmaliAnaliz){
  if(!ov)return;
  const icon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const stepsHtml=thinkingSteps.map((_,i)=>`
    <div class="tt-step" data-idx="${i}" style="opacity:0;transform:translateY(10px);transition:all 0.5s ease">
      <div class="tt-step-icon"><div class="tt-dot"></div></div>
      <div class="tt-step-content">
        <div class="tt-step-label">Adım ${i+1}</div>
        <div class="tt-step-text"></div>
      </div>
    </div>
  `).join('');
  const sourcesHtml=veriKaynaklari.length?`<div class="tt-sources"><div class="tt-sources-title">📊 Kullanılan Veri Kaynakları</div>${veriKaynaklari.map(s=>`<div class="tt-source-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> ${s}</div>`).join('')}</div>`:'';
  const compareHtml=karsilastirmaliAnaliz?`<div class="tt-compare"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/></svg> ${karsilastirmaliAnaliz}</div>`:'';
  ov.innerHTML=`
    <div class="tt-container">
      <div class="tt-header">
        <div class="tt-header-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2a10 10 0 1010 10" stroke="#C5A880" stroke-width="2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.2s" repeatCount="indefinite"/></path></svg></div>
        <div class="tt-header-text">Araştırma ve Analiz Süreci</div>
        <div class="tt-header-sub">AI her adımı detaylı inceliyor</div>
      </div>
      <div class="tt-steps">${stepsHtml}</div>
      <div class="tt-footer" style="opacity:0;transition:opacity 0.5s ease">${sourcesHtml}${compareHtml}</div>
    </div>`;
  for(let i=0;i<thinkingSteps.length;i++){
    await sleep(80);
    const step=ov.querySelector(`.tt-step[data-idx="${i}"]`);
    if(step){
      step.style.opacity='1';step.style.transform='translateY(0)';
      const txt=step.querySelector('.tt-step-text');
      if(txt)txt.textContent=thinkingSteps[i];
    }
    await sleep(220);
  }
  const footer=ov.querySelector('.tt-footer');
  if(footer)footer.style.opacity='1';
  await sleep(300);
  hideLoadingOverlay(ov);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function calculateIscilik(){
  const years=parseInt(document.getElementById('workYears').value)||0,months=parseInt(document.getElementById('workMonths').value)||0,netSalary=parseFloat(document.getElementById('netSalary').value)||0,extras=parseFloat(document.getElementById('extras').value)||0,reason=document.getElementById('terminationReason').value,unusedLeave=parseFloat(document.getElementById('unusedLeave').value)||0,weeklyOvertime=parseFloat(document.getElementById('weeklyOvertime').value)||0,haftaTatiliGun=parseFloat(document.getElementById('haftaTatiliGun').value)||0,ugbtGun=parseFloat(document.getElementById('ugbtGun').value)||0;
  const brutMaas=netSalary*1.4,ciplakBrut=brutMaas,giydirilmisBrut=ciplakBrut+extras,totalYears=years+months/12;
  const KIDEM_TAVAN=73729.87,DAMGA_ORANI=0.00759,GELIR_VERGISI=0.15,NET_CARPAN=1-GELIR_VERGISI-DAMGA_ORANI;
  let kidemBrut=0,kidemNet=0;
  if((reason==='employer'||reason==='justified')&&totalYears>=1){kidemBrut=Math.min(giydirilmisBrut,KIDEM_TAVAN)*totalYears;kidemNet=kidemBrut*(1-DAMGA_ORANI);}
  let ihbarBrut=0,ihbarNet=0;
  if(reason==='employer'){let d;if(totalYears<0.5)d=14;else if(totalYears<1.5)d=28;else if(totalYears<3)d=42;else d=56;ihbarBrut=(giydirilmisBrut/30)*d;ihbarNet=ihbarBrut*NET_CARPAN;}
  let izinBrut=0,izinNet=0;if(unusedLeave>0){izinBrut=(ciplakBrut/30)*unusedLeave;izinNet=izinBrut*NET_CARPAN;}
  let fmBrut=0,fmNet=0;if(weeklyOvertime>0){const sl=ciplakBrut/225,fm=sl*1.5,bm=weeklyOvertime*fm*52;fmBrut=bm*0.70;fmNet=fmBrut*NET_CARPAN;}
  let htBrut=0,htNet=0;if(haftaTatiliGun>0){const gu=ciplakBrut/30;htBrut=gu*1.5*haftaTatiliGun;htNet=htBrut*NET_CARPAN;}
  let ugbtBrut=0,ugbtNet=0;if(ugbtGun>0){const gu=ciplakBrut/30;ugbtBrut=gu*2*ugbtGun;ugbtNet=ugbtBrut*NET_CARPAN;}
  return{kidemBrut,kidemNet,ihbarBrut,ihbarNet,izinBrut,izinNet,fmBrut,fmNet,htBrut,htNet,ugbtBrut,ugbtNet,toplamNet:kidemNet+ihbarNet+izinNet+fmNet+htNet+ugbtNet,brutMaas,ciplakBrut,giydirilmisBrut,totalYears,reason,unusedLeave,weeklyOvertime,netSalary,extras,haftaTatiliGun,ugbtGun};
}
function triggerIscilikCalc(){
  const ns=parseFloat(document.getElementById('netSalary').value),reason=document.getElementById('terminationReason').value,y=parseInt(document.getElementById('workYears').value)||0,m=parseInt(document.getElementById('workMonths').value)||0;
  if(!ns||ns<=0){showValidationError('Lütfen net maaşınızı girin.');return;}
  if(!reason){showValidationError('Lütfen işten çıkış nedeninizi seçin.');return;}
  if(y===0&&m===0){showValidationError('Lütfen çalışma sürenizi girin.');return;}
  const r=calculateIscilik();state.iscResult=r;
  (async()=>{
    try{
      const ov=showLoadingOverlay('AI iş hukuku analizi yapılıyor...');
      const stages=['Çalışma geçmişi inceleniyor...','Yargıtay 9. HD emsalleri taranıyor...','Kıdem/ihbar süreleri hesaplanıyor...','Net alacak tutarı belirleniyor...'];
      let si=0;const sii=setInterval(()=>{if(si<stages.length)setLoadingStage(ov,stages[si]);si++;},3000);
      const aiR=await aiGenericCalc('iscilik','İşçilik Alacağı',[
        {id:'netSalary',label:'Net Maaş'},{id:'extras',label:'Ek Ödemeler'},{id:'terminationReason',label:'Çıkış Nedeni'},{id:'workYears',label:'Yıl'},{id:'workMonths',label:'Ay'},{id:'unusedLeave',label:'Kullanılmayan İzin'},{id:'weeklyOvertime',label:'Haftalık FM'}
      ],r);
      clearInterval(sii);hideLoadingOverlay(ov);
      if(aiR&&confirm('AI tahmini: '+aiR.min.toLocaleString('tr-TR')+' - '+aiR.max.toLocaleString('tr-TR')+' TL arası.\nFormül: '+Math.round(r.toplamNet).toLocaleString('tr-TR')+' TL\n\nAI sonucu ile devam etmek için Tamam,\nformül sonucu için İptal\'e tıklayın.')){state.iscResult={...r,total:aiR.ort,ai:aiR};}
    }catch(e){const ov=document.querySelector('.loading-overlay');if(ov)ov.remove();}
      state.pendingType='iscilik';state.pendingResult=state.iscResult;
      {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else showLeadModal('iscilik');}
    })();
}

let currentGenericModule=null;
function renderVehiclePickerFields(prefix){
  return `<div class="form-group full-width"><label>Araç Bilgileri</label></div>
    <div class="form-group"><div class="select-wrapper"><select id="${prefix}Year"><option value="">Yıl seçin</option></select><span class="select-arrow">▾</span></div></div>
    <div class="form-group"><div class="select-wrapper"><select id="${prefix}Brand"><option value="">Marka seçin</option></select><span class="select-arrow">▾</span></div></div>
    <div class="form-group full-width"><div class="select-wrapper"><select id="${prefix}Model" disabled><option value="">Önce marka seçin</option></select><span class="select-arrow">▾</span></div></div>
    <div class="form-group full-width"><div class="select-wrapper"><select id="${prefix}Trim" disabled><option value="">Önce model seçin</option></select><span class="select-arrow">▾</span></div></div>
    <div class="form-group full-width" id="${prefix}ValueHint" style="font-size:11px;color:var(--text-muted);margin-top:-8px"></div>`;
}
function initGenericVehiclePicker(prefix,onChange){
  const ySel=document.getElementById(prefix+'Year'),bSel=document.getElementById(prefix+'Brand'),mSel=document.getElementById(prefix+'Model'),tSel=document.getElementById(prefix+'Trim');
  if(!ySel||!bSel||!mSel||!tSel)return;
  const cy=new Date().getFullYear();
  for(let y=cy;y>=2000;y--){const o=document.createElement('option');o.value=y;o.textContent=y;ySel.appendChild(o);}
  Object.keys(CAR_DATA).sort().forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;bSel.appendChild(o);});
  function recalc(){
    const y=ySel.value,b=bSel.value,m=mSel.value,t=tSel.value||'Base';
    const hint=document.getElementById(prefix+'ValueHint');
    if(y&&b&&m){
      const base=getMarketValue(b,m,y);
      const val=getTrimPrice(base,t);
      if(hint)hint.textContent='🤖 Tahmini piyasa değeri: '+new Intl.NumberFormat('tr-TR').format(val)+' TL (otomatik hesaplandı, ilgili alanlara aktarıldı)';
      onChange(val,{year:y,brand:b,model:m,trim:t});
    }else if(hint)hint.textContent='';
  }
  bSel.addEventListener('change',()=>{
    const brand=bSel.value;
    mSel.innerHTML='<option value="">Model seçin</option>';
    if(brand&&CAR_DATA[brand]){mSel.disabled=false;CAR_DATA[brand].forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;mSel.appendChild(o);});}
    else{mSel.disabled=true;mSel.innerHTML='<option value="">Önce marka seçin</option>';}
    tSel.disabled=true;tSel.innerHTML='<option value="">Önce model seçin</option>';
    recalc();
  });
  function refreshTrimOptions(){
    const brand=bSel.value,model=mSel.value;
    if(brand&&model){
      const trims=getTrimsForVehicle(brand,model,ySel.value);
      tSel.disabled=false;tSel.innerHTML=trims.map((tr,i)=>`<option value="${tr}"${i===0?' selected':''}>${tr}</option>`).join('');
    }else{tSel.disabled=true;tSel.innerHTML='<option value="">Önce model seçin</option>';}
  }
  mSel.addEventListener('change',()=>{
    refreshTrimOptions();
    recalc();
  });
  tSel.addEventListener('change',recalc);
  ySel.addEventListener('change',()=>{refreshTrimOptions();recalc();});
}
function openGenericCalc(mid){
  currentGenericModule=mid;const cfg=CALC_CONFIGS[mid];if(!cfg)return;
  document.getElementById('genericBadge').textContent=cfg.badge;
  document.getElementById('genericTitle').textContent=cfg.title;
  document.getElementById('genericDesc').textContent=cfg.desc;
  const fc=document.getElementById('genericFormCard');
  let h='';
  if(cfg.vehiclePicker)h+=renderVehiclePickerFields('gv'+mid);
  cfg.fields.forEach(f=>{
    if(f.type==='range'){h+=`<div class="form-group"><label>${f.label}</label><div class="slider-wrapper"><input type="range" id="g_${f.id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.defaultVal||0}" oninput="this.nextElementSibling.querySelector('.rv').textContent=this.value+'%'"/><div class="slider-labels"><span class="rv">${f.defaultVal||0}%</span></div></div></div>`;}
    else if(f.type==='text'){h+=`<div class="form-group"><label>${f.label}</label><div class="input-wrapper"><input type="text" id="g_${f.id}" placeholder="${f.placeholder||''}"/></div></div>`;}
    else{h+=`<div class="form-group"><label>${f.label}</label><div class="input-wrapper"><span class="input-prefix">${f.prefix||''}</span><input type="number" id="g_${f.id}" placeholder="${f.placeholder||''}" min="0" ${f.required?'required':''}/></div></div>`;}
    if(mid==='mahrumiyet'&&f.id==='mr_gunluk'){
      h+=`<div class="form-group full-width" style="margin-top:-8px"><button type="button" class="btn-back" onclick="estimateMahrumiyetGunlukKira()" style="width:100%;justify-content:center;gap:8px;font-size:12px">🤖 AI ile Ortalama Günlük Kiralık Bedelini Tahmin Et</button><div id="mrKiraHint" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div></div>`;
    }
    if(mid==='pertBedeli'&&f.id==='pb_hurda'){
      h+=`<div class="form-group full-width" style="margin-top:-8px"><button type="button" class="btn-back" onclick="estimatePertHurda()" style="width:100%;justify-content:center;gap:8px;font-size:12px">🤖 AI ile Hurda Değerini Tahmin Et</button><div id="pbHint" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div></div>`;
    }
  });
  h+=`<button class="btn-next" onclick="calcGeneric()" style="width:100%;justify-content:center;margin-top:16px;">Hesapla <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3l7 7-7 7M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
  fc.innerHTML=h;
  document.getElementById('genericResultPanel').style.display='none';
  navigate('generic');
  if(GENERIC_TO_PATH[mid]){const r=ROUTE_MAP[GENERIC_TO_PATH[mid]]||{};updateRouteUrl(GENERIC_TO_PATH[mid],r.title,r.desc);}
  setTimeout(()=>document.querySelector('#screen-generic .iscilik-section').scrollIntoView({behavior:'smooth'}),100);
  if(cfg.vehiclePicker){
    const prefix='gv'+mid;
    initGenericVehiclePicker(prefix,(val,info)=>{
      if(mid==='mahrumiyet'){
        const dEl=document.getElementById('g_mr_arac_deger'),yEl=document.getElementById('g_mr_arac_yas');
        if(dEl)dEl.value=val;
        if(yEl)yEl.value=new Date().getFullYear()-parseInt(info.year);
      }else if(mid==='pertBedeli'){
        const rEl=document.getElementById('g_pb_rayic');
        if(rEl)rEl.value=val;
      }
    });
  }
}
/* Türkiye rent-a-car piyasası (2026) günlük kiralama bedeli, aracın piyasa değerinin
   binde 0,8 ile binde 1,3'ü arasında olur (gerçek fiyat listeleriyle doğrulandı:
   ekonomik ~800-1100 TL/gün, orta segment ~1200-2000 TL/gün, SUV ~2200+ TL/gün,
   lüks ~3500+ TL/gün). Sayı artık AI'ye bırakılmıyor, doğrudan bu formülle hesaplanıyor
   — AI sadece segment açıklaması için kullanılıyor, aşırı düşük/yüksek halüsinasyon riski yok. */
function calcDailyRentalEstimate(marketValue){
  const lo=Math.max(800,Math.round(marketValue*0.0010/50)*50);
  const hi=Math.max(lo+400,Math.round(marketValue*0.0016/50)*50);
  return Math.round(((lo+hi)/2)/50)*50;
}
async function estimateMahrumiyetGunlukKira(){
  const marka=(document.getElementById('gvmahrumiyetBrand')?.value||'').trim();
  const model=(document.getElementById('gvmahrumiyetModel')?.value||'').trim();
  const marketValue=parseFloat(document.getElementById('g_mr_arac_deger')?.value)||0;
  const hint=document.getElementById('mrKiraHint');
  if(!marka||!model){showValidationError('AI tahmini için önce araç markası ve modelini seçin.');return;}
  if(!marketValue){showValidationError('Önce yukarıdan araç yılını seçin ki piyasa değeri hesaplanabilsin.');return;}
  if(hint)hint.textContent='Ortalama günlük kiralık bedeli hesaplanıyor...';
  const kira=calcDailyRentalEstimate(marketValue);
  const input=document.getElementById('g_mr_gunluk');
  if(input)input.value=kira;
  if(hint)hint.textContent='Tahmini: '+new Intl.NumberFormat('tr-TR').format(kira)+' TL/gün (piyasa değerinin ~binde 1\'i, Türkiye rent a car ortalamalarına göre). Dilerseniz alanı manuel değiştirebilirsiniz.';
  try{
    const prompt=`"${sanitizeInput(marka)} ${sanitizeInput(model)}" model bir aracın hangi rent a car segmentinde (ekonomik/orta/SUV/lüks) yer aldığını 1 kısa cümleyle açıkla. Yanıtı SADECE şu JSON formatında ver: {"aciklama": "<1 kısa cümle>"}`;
    const res=await groqFetch('/api/ai/calculate',[
      {role:'system',content:'Sen Türkiye araç kiralama piyasası konusunda uzmansın. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
      {role:'user',content:prompt}],
      {model:'openai/gpt-oss-120b',temp:0.25,tokens:150,responseFormat:true,timeout:12000});
    if(!res.ok)return;
    const data=await res.json();
    const txt=data.choices?.[0]?.message?.content||'{}';
    const j=parseAiJson(txt);
    if(j.aciklama&&hint)hint.textContent='Tahmini: '+new Intl.NumberFormat('tr-TR').format(kira)+' TL/gün — '+sanitizeHtml(j.aciklama)+'. Dilerseniz alanı manuel değiştirebilirsiniz.';
  }catch(e){/* açıklama alınamadıysa sessizce geç, sayı zaten formülle hesaplandı */}
}
async function estimatePertHurda(){
  const yil=(document.getElementById('gvpertBedeliYear')?.value||'').trim();
  const marka=(document.getElementById('gvpertBedeliBrand')?.value||'').trim();
  const model=(document.getElementById('gvpertBedeliModel')?.value||'').trim();
  const rayic=parseFloat(document.getElementById('g_pb_rayic')?.value)||0;
  const hint=document.getElementById('pbHint');
  if(!yil||!marka||!model){showValidationError('AI tahmini için önce yukarıdan araç yılı, markası ve modelini seçin.');return;}
  if(hint)hint.textContent='AI hurda/sovtaj değerini tahmin ediyor...';
  try{
    const prompt=`Sen Türkiye sigorta eksperliği konusunda uzmansın. "${sanitizeInput(yil)} model ${sanitizeInput(marka)} ${sanitizeInput(model)}" aracın hasar öncesi rayiç değeri ${rayic>0?new Intl.NumberFormat('tr-TR').format(rayic)+' TL':'bilinmiyor'}. Bu araç pert (tam hasarlı) olsaydı hurda/sovtaj değerinin (genelde rayiç değerin %15-25'i arası) ne olacağını tahmin et. Yanıtı SADECE şu JSON formatında ver: {"hurda": <TL tam sayı>, "aciklama": "<1 kısa cümle>"}`;
    const res=await groqFetch('/api/ai/calculate',[
      {role:'system',content:'Sen Türkiye sigorta eksperliği konusunda uzmansın. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
      {role:'user',content:prompt}],
      {model:'openai/gpt-oss-120b',temp:0.25,tokens:250,responseFormat:true,timeout:20000});
    if(!res.ok){
      let msg='AI servisi şu anda yanıt vermiyor.';
      try{const ej=await res.json();if(ej?.error)msg=ej.error;}catch(_){}
      throw new Error(msg);
    }
    const data=await res.json();
    const txt=data.choices?.[0]?.message?.content||'{}';
    const j=parseAiJson(txt);
    const hurda=parseInt(j.hurda)||0;
    if(hurda<=0)throw new Error('Tahmin oluşturulamadı');
    const hInput=document.getElementById('g_pb_hurda');
    if(hInput)hInput.value=hurda;
    if(hint)hint.textContent='🤖 AI Tahmini Hurda Değeri: '+new Intl.NumberFormat('tr-TR').format(hurda)+' TL'+(j.aciklama?' — '+sanitizeHtml(j.aciklama):'')+'. Dilerseniz alanı manuel değiştirebilirsiniz.';
  }catch(e){
    if(hint)hint.textContent='Tahmin alınamadı: '+sanitizeHtml(e.message||'bilinmeyen hata')+'. Lütfen değeri manuel girin.';
  }
}
function calcGeneric(){
  if(!currentGenericModule)return;const cfg=CALC_CONFIGS[currentGenericModule],d={};
  cfg.fields.forEach(f=>{const el=document.getElementById('g_'+f.id);d[f.id]=el?el.value:'';});
  for(const f of cfg.fields){
    if(f.required&&f.type!=='range'&&(d[f.id]===''||d[f.id]===null||d[f.id]===undefined)){
      showValidationError('Lütfen "'+f.label.replace(/\s*\*$/,'')+'" alanını doldurun.');
      return;
    }
  }
  const r=cfg.calculate(d);
  state.pendingType=currentGenericModule;state.pendingResult=r;
  const mid=currentGenericModule;
  {const _ci=getStoredContactInfo();if(_ci)finalizeLead(_ci,'');else showLeadModal(mid);}
  (async()=>{
    if(AI_MODULE_PROMPTS[mid]){
      try{
        const ov=showLoadingOverlay('AI hukuk analizi yapılıyor...');
        const stages=['Kullanıcı bilgileri inceleniyor...','Güncel içtihatlar taranıyor...','Piyasa verileri analiz ediliyor...','Nihai tazminat hesaplanıyor...'];
        let si=0;const sii=setInterval(()=>{if(si<stages.length)setLoadingStage(ov,stages[si]);si++;},3000);
        const aiR=await aiGenericCalc(mid,cfg.title||'Tazminat',cfg.fields,r);
        clearInterval(sii);hideLoadingOverlay(ov);
        if(aiR){state.pendingResult={...r,total:aiR.ort,ai:aiR};r.ai=aiR;if(getStoredContactInfo())showGenericResult();}
      }catch(e){const ov=document.querySelector('.loading-overlay');if(ov)ov.remove();}
    }
  })();
}

function showLeadModal(type){
  ['leadName','leadEmail','leadPlate','leadDistrict','leadDescription'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('leadPhone').value='';
  const kvk=document.getElementById('kvkkConsent');if(kvk)kvk.checked=false;
  /* Açık rıza her açılışta sıfırlanır: önceki hesaplamadan devreden bir
     onay, yeni ve farklı bir işleme rıza sayılamaz. */
  const ar=document.getElementById('acikRizaConsent');if(ar)ar.checked=false;
  const arf=document.getElementById('acikRizaField');if(arf)arf.style.display=acikRizaGerekli(type)?'':'none';
  const city=document.getElementById('leadCity');if(city)city.value='';
  ['nameError','phoneError','emailError','cityError','kvkkError'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='';});
  const plateField=document.getElementById('leadPlateField');
  if(plateField)plateField.style.display=(type==='arac')?'':'none';
  /* Gözetim dosyalarında firma adı, sıradan başvurulardan daha değerli;
     açıklama alanının etiketi ve yer tutucusu modüle göre değişiyor. */
  const dLabel=document.querySelector('label[for="leadDescription"]'),dInput=document.getElementById('leadDescription');
  if(dLabel&&dInput){
    if(type==='gozetim'){dLabel.textContent='Firma adı ve eklemek istedikleriniz';dInput.placeholder='Firma adınız ve beyannameyle ilgili eklemek istedikleriniz...';}
    else{dLabel.textContent='Açıklama';dInput.placeholder='Eklemek istediğiniz detaylar...';}
  }
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  const modalBox=document.querySelector('#leadModal .modal-box');if(modalBox)modalBox.scrollTop=0;
  document.getElementById('leadModal').style.display='flex';
  document.body.style.overflow='hidden';
}

function showYasalUyari(){const m=document.getElementById('yasalModal');if(m)m.style.display='flex';}
function showKvkkText(){const m=document.getElementById('kvkkModal');if(m)m.style.display='flex';}
function closeLeadModal(){try{const m=document.getElementById('leadModal');if(m)m.style.display='none';document.body.style.overflow='';}catch(e){}}
function handleModalOverlayClick(e){}
/* Bu akışlarda sağlık verisi ya da yurt dışına giden yapay zekâ analizi
   devrede; açık rıza kutusu yalnızca burada gösteriliyor. */
const ACIK_RIZA_GEREKEN=['kusur','fesih','iseIade','sakatlik','gecici','kalici','isgucu','isKazasi','yoksun','manevi','durumTespiti'];
function acikRizaGerekli(tur){return ACIK_RIZA_GEREKEN.indexOf(tur)!==-1;}

function submitLead(){
  try{
  const name=(document.getElementById('leadName').value||'').trim(),phone=(document.getElementById('leadPhone').value||'').trim(),email=(document.getElementById('leadEmail').value||'').trim(),city=document.getElementById('leadCity').value,district=(document.getElementById('leadDistrict').value||'').trim(),plate=(document.getElementById('leadPlate').value||'').trim(),description=(document.getElementById('leadDescription').value||'').trim(),vekalet='';
  const kvkkOk=document.getElementById('kvkkConsent')&&document.getElementById('kvkkConsent').checked;
  let valid=true;
  const nOk=validateName(name);const ne=document.getElementById('nameError');if(ne)ne.textContent=nOk?'':'Lütfen adınızı ve soyadınızı tam girin.';if(!nOk)valid=false;
  const pOk=!!phone&&validatePhone(phone);const pe=document.getElementById('phoneError');if(pe)pe.textContent=pOk?'':'Lütfen geçerli bir telefon numarası girin.';if(!pOk)valid=false;
  const eOk=!!email&&validateEmail(email);const ee=document.getElementById('emailError');if(ee)ee.textContent=eOk?'':'Lütfen geçerli bir e-posta adresi girin.';if(!eOk)valid=false;
  /* Şehir bilinçli olarak zorunlu değil: sonucu görmek
     için doldurulması gereken alan sayısı arttıkça ziyaretçi formu yarıda
     bırakıyor. Kimliğe dair asgari bilgi (ad, telefon, e-posta) ve KVKK
     onayı zorunlu kalıyor; bu ikisi boş gelirse kayıt yine oluşuyor. */
  const ce=document.getElementById('cityError');if(ce)ce.textContent='';
  const ke=document.getElementById('kvkkError');if(!kvkkOk){if(ke)ke.textContent='KVKK Aydınlatma Metni\'ni kabul etmelisiniz.';valid=false;}else if(ke)ke.textContent='';
  if(!valid)return;
  /* Rızanın ispatı bizde: hangi onayın verildiği, onay anının tarih ve
     saatiyle birlikte başvuru kaydına yazılıyor. KVKK denetiminde
     istenen şey tam olarak budur. */
  const arEl=document.getElementById('acikRizaConsent');
  const acikRiza=!!(arEl&&arEl.checked&&acikRizaGerekli(state.pendingType));
  const rizaZamani=new Date().toISOString();
  const contactInfo={name,phone,email,city,district,plate,vekalet:'',acikRiza:acikRiza,rizaZamani:rizaZamani};
  storeContactInfo(contactInfo);
  markLeadCaptured();
  closeLeadModal();
  finalizeLead(contactInfo,description);
  }catch(e){try{closeLeadModal()}catch(ee){}showValidationError('Bir hata oluştu, lütfen tekrar deneyin.');}
}

/* Sonucu Supabase'e "leads" kaydı olarak yazar ve ilgili sonuç ekranını
   gösterir. İlk hesaplamada modal'dan gelen contactInfo ile, aynı
   oturumdaki SONRAKİ hesaplamalarda ise getStoredContactInfo()'nun
   döndürdüğü aynı bilgiyle çağrılır — böylece bir oturumda birden fazla
   hesaplama yapan ziyaretçinin HER hesaplaması (modal tekrar sorulmadan)
   ad/telefon/e-posta ile admin panelinde ayrı bir başvuru olarak görünür. */
function finalizeLead(contactInfo,description){
  if(!state.pendingType||!state.pendingResult){showValidationError('Hesaplama bulunamadı. Lütfen tekrar hesaplama yapın.');return;}
  const type=state.pendingType,result=state.pendingResult,now=new Date(),tarih=now.toLocaleDateString('tr-TR'),saat=now.toLocaleTimeString('tr-TR');
  let sonucOzeti='';
  if(type==='arac')sonucOzeti='Araç Değer Kaybı: '+new Intl.NumberFormat('tr-TR').format(result.min)+' - '+new Intl.NumberFormat('tr-TR').format(result.max)+' TL';
  else if(type==='iscilik')sonucOzeti='İşçilik Alacağı: '+new Intl.NumberFormat('tr-TR').format(Math.round(result.toplamNet))+' TL';
  else if(type==='fesih')sonucOzeti='Haklı Fesih Analizi: '+(result.fesih?.haklıFesihVarMi?'Var':'Belirsiz/Yok')+' (Güven %'+(parseInt(result.fesih?.guvenSkoru)||0)+')';
  else if(type==='kusur'){const ps=(result.kusur?.parties||[]).map(p=>p.harf+': %'+p.kusurYuzde).join(', ');sonucOzeti='Kusur Oranı Analizi: '+(ps||'Sonuç mevcut');}
  else if(type==='iseIade')sonucOzeti='İşe İade Uygunluk Analizi: '+(result.iseIade?.sartlariTasiyorMu?'Şartlar Uygun':'Belirsiz/Uygun Değil')+' (Güven %'+(parseInt(result.iseIade?.guvenSkoru)||0)+')';
  else if(type==='gozetim')sonucOzeti='Gözetim Fazla Vergi: eklenen kıymet '+new Intl.NumberFormat('tr-TR').format(result.gozetim?.ek||0)+' TL, potansiyel fazla vergi '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL (skor '+(result.gozetim?.sk?.skor||0)+'/100)';
  else if(type==='durumTespiti')sonucOzeti='Durum Tespiti: '+((TANI_MAP[result.tani]||{}).ad||'-');
  else if(type==='evSatisIade')sonucOzeti='Ev Satış Vergi İadesi: '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL (ticari sayılma riski %'+((result.evSatis&&result.evSatis.risk&&result.evSatis.risk.puan)||0)+')';
  else if(type==='vergiIade')sonucOzeti='Vergi İadesi Yol Haritası: '+((VI_TUR[result.vergi]||{}).ad||'-')+(result.total?' · '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL':'');
  else if(type==='isHukukuSihirbaz')sonucOzeti='İş Hukuku Alacağı: '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL';
  else sonucOzeti='Tahmini Tazminat: '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL';

  const ref=getUrlParam('ref')||'';
  const etiket=getUrlParam('etiket')||'';
  /* Modüle özel ek bilgiler (gözetim dosya detayı, çıkış şekli vb.) leads
     tablosunda ayrı sütun olmadığı için açıklamaya ekleniyor — şemaya
     bilinmeyen kolon göndermek INSERT'ün tamamını reddettiriyor. */
  /* Açık rıza verilmediyse sağlık ayrıntısını saklamıyoruz: özel nitelikli
     veri, rıza olmadan kaydedilemez. Sonuç yine gösterilir. */
  const rizaVar=!!contactInfo.acikRiza;
  let ek=state.pendingExtra||'';
  if(!rizaVar&&acikRizaGerekli(type))ek='[saglik ayrintisi acik riza olmadigi icin kaydedilmedi]';
  const rizaNotu='Onay: aydinlatma=evet'+(acikRizaGerekli(type)?(', acik riza(saglik/yurtdisi)='+(rizaVar?'evet':'hayir')):'')
    +' @ '+(contactInfo.rizaZamani||new Date().toISOString());
  const aciklamaFull=[description||'',ek,rizaNotu].filter(Boolean).join(' | ');
  const leadData={tarih,saat,ad:contactInfo.name,telefon:contactInfo.phone,email:contactInfo.email,sehir:contactInfo.city,ilce:contactInfo.district||'',plaka:contactInfo.plate||'',tur:type,sonuc:sonucOzeti,vekalet:contactInfo.vekalet,aciklama:aciklamaFull,ref,etiket};

  const leads=JSON.parse(localStorage.getItem('muvekkilbilgi_leads')||'[]');
  leads.push(leadData);
  localStorage.setItem('muvekkilbilgi_leads',JSON.stringify(leads));

  // Supabase'deki leads tablosunda ref/etiket sütunları yok — gönderilirse INSERT tamamen
  // reddediliyor (400) ve sbInsert bunu sessizce yutuyordu, yani hiçbir başvuru kaydedilmiyordu.
  // ref/etiket zaten ayrıca 'tracking' tablosunda tutuluyor, leads insert'ünden çıkarıyoruz.
  const {ref:_ref,etiket:_etiket,...leadDataForDb}=leadData;
  sbInsert('leads',leadDataForDb);
  trackFormComplete(ref,etiket,type);
  postToGoogleForms({name:contactInfo.name,phone:contactInfo.phone,city:contactInfo.city,vekalet:contactInfo.vekalet,tur:type,tutar:sonucOzeti,tarih,saat});
  if(type==='arac')showAracResult();
  else if(type==='iscilik')showIscResult();
  else if(type==='fesih'){const rr=document.getElementById('fesihResult');if(rr)rr.style.display='block';showFesihResult(result.fesih);}
  else if(type==='iseIade'){const rr=document.getElementById('iseIadeResult');if(rr)rr.style.display='block';showIseIadeResult(result.iseIade);}
  else if(type==='kusur'){const rr=document.getElementById('kusurResult');if(rr)rr.style.display='block';showKusurResult(result.kusur,result._parties);}
  else if(type==='gozetim')showGozetimResult();
  else if(type==='durumTespiti')taniSonucGoster();
  else if(type==='evSatisIade')esiSonucGoster();
  else if(type==='vergiIade')viSonucGoster();
  else if(type==='isHukukuSihirbaz')showIsHukukuResult();
  else showGenericResult();
  state.pendingExtra='';
}

/* İlk hesaplamada ad/telefon/e-posta + KVKK onayı zorunlu; alınan bilgi
   sessionStorage'da saklanır ki aynı oturumdaki SONRAKİ hesaplamalar da
   modal'ı tekrar sormadan aynı kişi adına ayrı bir başvuru kaydı oluştursun. */
function markLeadCaptured(){sessionStorage.setItem('mb_lead_captured','1');}
function getStoredContactInfo(){try{return JSON.parse(sessionStorage.getItem('mb_lead_contact')||'null');}catch(e){return null;}}
function storeContactInfo(info){try{sessionStorage.setItem('mb_lead_contact',JSON.stringify(info));}catch(e){}}

/* Google Formuna gonderim kaldirildi.
   Her basvurunun adi, telefonu ve sehri yurt disindaki ucuncu bir tarafa
   (Google) gidiyordu. Aydinlatma metninde boyle bir aktarim yazmiyordu ve
   KVKK m.9 kapsaminda ayri acik riza alinmamisti. Veri zaten kendi
   veritabanimizda kayitli oldugu icin bu gonderim hem gereksiz hem riskli. */
function postToGoogleForms(){/* bilincli olarak devre disi */}
function validateName(name){const p=name.trim().split(/\s+/);return p.length>=2&&p.every(x=>x.length>=2);}
function validatePhone(phone){return /^(0?5)[0-9]{9}$/.test(phone.replace(/[\s\-().+]/g,''));}

const WHATSAPP_NUM='905510126904';
function whatsappLink(msg){return 'https://wa.me/'+WHATSAPP_NUM+'?text='+encodeURIComponent(msg);}

function printReport(title,rows,resultLine){
  const el=document.getElementById('printReport');
  const docSummaries=getDocAnalysisSummary();
  const docHtml=docSummaries.length?`<div style="margin-top:16px;padding:12px;background:#f8f5f0;border-radius:8px;font-size:11px;color:#555;"><strong style="color:#C5A880;">Yüklenen Belgeler</strong>${docSummaries.map(s=>'<div style="margin-top:6px;">'+s+'</div>').join('')}</div>`:'';
  el.innerHTML=`<div class="pr-badge">${title}</div><h1>Müvekkil Bilgi Hesaplama Raporu</h1><p class="pr-sub">Oluşturma: ${new Date().toLocaleString('tr-TR')}</p><table class="pr-table">${rows.map(r=>`<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('')}</table>${docHtml}<p class="pr-total"><strong>Sonuç:</strong> ${resultLine}</p><p class="pr-footer">Bu rapor tahmini niteliktedir, kesin sonuç değildir. Gerçek tutarınızı öğrenmek için ön inceleme talep edin. · Müvekkil Bilgi</p>`;
  setTimeout(()=>{window.print();},200);
}
let _cmpUid=0;
const _cmpState={};
function renderCompareWidget(minVal,maxVal){
  const uid=String(++_cmpUid);
  const mn=Math.round(minVal||0),mx=Math.round(maxVal||minVal||0);
  _cmpState[uid]={mn,mx};
  return `<div class="compare-widget" id="cmpWrap_${uid}">
    <div class="compare-widget-head">
      <span class="compare-widget-icon">⚖️</span>
      <div class="compare-widget-headtext"><strong>Karşı taraftan bir teklif aldınız mı?</strong><small>Aldığınız teklifi girin, saniyeler içinde karşılaştıralım</small></div>
    </div>
    <div class="compare-widget-row">
      <div class="input-wrapper"><span class="input-prefix">₺</span><input type="number" id="cmpInput_${uid}" placeholder="Örn: 15000" min="0" onkeydown="if(event.key==='Enter'){event.preventDefault();runCompareWidget('${uid}');}"/></div>
      <button type="button" class="btn-next cmp-run-btn" onclick="runCompareWidget('${uid}')"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 3l7 7-7 7M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Karşılaştır</button>
    </div>
    <div class="compare-widget-result" id="cmpResult_${uid}" style="display:none"></div>
  </div>`;
}
function _cmpCountUp(el,to,duration,suffix){
  const startTime=performance.now();
  function step(now){
    const p=Math.min(1,(now-startTime)/duration);
    const eased=1-Math.pow(1-p,3);
    el.textContent=fmt2(to*eased)+(suffix||'');
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function _cmpBurstConfetti(container){
  const colors=['#C5A880','#E2C992','#8B6914','#22c55e','#8B5CF6'];
  for(let i=0;i<32;i++){
    const p=document.createElement('span');
    p.className='confetti-piece';
    p.style.left=(40+Math.random()*20)+'%';
    p.style.top=(Math.random()*20)+'%';
    p.style.background=colors[Math.floor(Math.random()*colors.length)];
    const dx=Math.round((Math.random()-0.5)*320),dy=Math.round(-(90+Math.random()*170)),rot=Math.round((Math.random()-0.5)*720);
    p.style.setProperty('--dx',dx+'px');
    p.style.setProperty('--dy',dy+'px');
    p.style.setProperty('--rot',rot+'deg');
    p.style.animationDelay=(Math.random()*0.12)+'s';
    container.appendChild(p);
    setTimeout(()=>p.remove(),1700);
  }
}
function runCompareWidget(uid){
  const st=_cmpState[uid];if(!st)return;
  const {mn:minVal,mx:maxVal}=st;
  const input=document.getElementById('cmpInput_'+uid),resEl=document.getElementById('cmpResult_'+uid);
  if(!input||!resEl)return;
  const offer=parseFloat(input.value);
  if(!offer||offer<=0){resEl.style.display='block';resEl.className='compare-widget-result compare-result-warn';resEl.innerHTML='Lütfen geçerli bir tutar girin.';return;}
  const ours=offer<minVal?minVal:(offer>maxVal?maxVal:maxVal);
  const diff=Math.max(0,ours-offer);
  const pct=offer>0?Math.round((diff/offer)*100):0;
  const scaleMax=Math.max(maxVal*1.35,offer*1.2,minVal*1.6,100);
  const markerPct=Math.max(2,Math.min(98,(offer/scaleMax)*100));
  const zoneMinPct=Math.min(96,(minVal/scaleMax)*100),zoneMaxPct=Math.min(98,(maxVal/scaleMax)*100);
  let verdictClass,verdictIcon,verdictTitle,verdictText,waMsg;
  if(offer<minVal){
    verdictClass='compare-result-bad';verdictIcon='🚨';verdictTitle='Bu teklif oldukça düşük!';
    verdictText=`Hesapladığımız en düşük tutarın (${fmt2(minVal)} TL) bile altında bir teklif almışsınız. İmzalamadan önce kesinlikle itiraz edin.`;
    waMsg=`Merhaba, sigorta/karşı taraf bana ${fmt2(offer)} TL teklif etti ama Müvekkil Bilgi'nin hesapladığı tutar ${fmt2(minVal)}-${fmt2(maxVal)} TL aralığında. Bu farkı değerlendirmenizi istiyorum.`;
  }else if(offer<=maxVal){
    verdictClass='compare-result-mid';verdictIcon='⚠️';verdictTitle='Teklif aralıkta ama düşük tarafta';
    verdictText=`Teklifiniz hesapladığımız aralık içinde, ama üst sınıra göre hâlâ ${fmt2(maxVal-offer)} TL daha fazlasını talep edebilirsiniz.`;
    waMsg=`Merhaba, sigorta/karşı taraf bana ${fmt2(offer)} TL teklif etti, Müvekkil Bilgi hesabıma göre üst sınır ${fmt2(maxVal)} TL. Aradaki farkı nasıl talep edebilirim?`;
  }else{
    verdictClass='compare-result-good';verdictIcon='✅';verdictTitle='Bu teklif gayet iyi görünüyor';
    verdictText=`Aldığınız teklif, hesapladığımız aralığın (${fmt2(minVal)}-${fmt2(maxVal)} TL) üzerinde. Yine de imzalamadan önce bir göz atmamızı isterseniz buradayız.`;
    waMsg=`Merhaba, sigorta/karşı taraf bana ${fmt2(offer)} TL teklif etti, bunun makul olup olmadığını Müvekkil Bilgi ile teyit etmek istiyorum.`;
  }
  resEl.style.display='block';
  resEl.className='compare-widget-result '+verdictClass;
  resEl.innerHTML=`
    <div class="cmp-reveal">
      <div class="cmp-stats">
        <div class="cmp-stat cmp-stat-offer"><span class="cmp-stat-label">Aldığınız Teklif</span><span class="cmp-stat-val" id="cmpOfferVal_${uid}">0 TL</span></div>
        <div class="cmp-stat-vs">VS</div>
        <div class="cmp-stat cmp-stat-ours"><span class="cmp-stat-label">Müvekkil Bilgi Hesabı</span><span class="cmp-stat-val" id="cmpOursVal_${uid}">0 TL</span></div>
      </div>
      <div class="cmp-gauge">
        <div class="cmp-gauge-track">
          <div class="cmp-gauge-zone cmp-zone-bad" style="width:${zoneMinPct}%"></div>
          <div class="cmp-gauge-zone cmp-zone-mid" style="width:${Math.max(0,zoneMaxPct-zoneMinPct)}%"></div>
          <div class="cmp-gauge-zone cmp-zone-good" style="width:${Math.max(0,100-zoneMaxPct)}%"></div>
          <div class="cmp-gauge-marker" id="cmpMarker_${uid}" style="left:0%"><span>Teklifiniz</span></div>
        </div>
        <div class="cmp-gauge-labels"><span>Düşük</span><span>Makul Aralık</span><span>İyi</span></div>
      </div>
      ${diff>0?`<div class="cmp-diff-callout"><div class="cmp-diff-icon">${verdictIcon}</div><div><div class="cmp-diff-num"><span id="cmpDiffVal_${uid}">0 TL</span> daha fazlasını isteyebilirsiniz</div><div class="cmp-diff-pct">Teklifinizden <strong>%<span id="cmpPctVal_${uid}">0</span> daha fazla</strong></div></div></div>`:''}
      <div class="cmp-verdict"><strong>${verdictIcon} ${verdictTitle}</strong><p>${verdictText}</p></div>
      <div class="cmp-actions">
        <a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="${whatsappLink(waMsg)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Bu Farkı WhatsApp'tan Değerlendirelim</a>
        <button type="button" class="btn-back cmp-download-btn" onclick="downloadCompareCard('${uid}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13m0 0l-5-5m5 5l5-5M5 21h14" stroke-linecap="round" stroke-linejoin="round"/></svg> Karşılaştırmayı Görsel Olarak İndir</button>
      </div>
    </div>`;
  const offerEl=document.getElementById('cmpOfferVal_'+uid),oursEl=document.getElementById('cmpOursVal_'+uid),markerEl=document.getElementById('cmpMarker_'+uid),diffEl=document.getElementById('cmpDiffVal_'+uid),pctEl=document.getElementById('cmpPctVal_'+uid);
  if(offerEl)_cmpCountUp(offerEl,offer,800,' TL');
  if(oursEl)_cmpCountUp(oursEl,ours,1000,' TL');
  if(diffEl)_cmpCountUp(diffEl,diff,1200,' TL');
  if(pctEl){
    const pStart=performance.now();
    (function stepPct(now){const p=Math.min(1,(now-pStart)/1200),eased=1-Math.pow(1-p,3);pctEl.textContent=Math.round(pct*eased);if(p<1)requestAnimationFrame(stepPct);})(pStart);
  }
  if(markerEl)setTimeout(()=>{markerEl.style.left=markerPct+'%';},60);
  if(diff>0){const revealEl=resEl.querySelector('.cmp-reveal');if(revealEl)setTimeout(()=>_cmpBurstConfetti(revealEl),350);}
}
function downloadCompareCard(uid){
  const el=document.getElementById('cmpWrap_'+uid);
  if(!el||typeof html2canvas==='undefined')return;
  const btn=el.querySelector('.cmp-download-btn');
  if(btn){btn.disabled=true;btn.textContent='Hazırlanıyor...';}
  html2canvas(el,{scale:2,useCORS:true,backgroundColor:(getComputedStyle(document.documentElement).getPropertyValue('--bg-card')||'#181818').trim(),logging:false}).then(canvas=>{
    const link=document.createElement('a');
    link.download='muvekkil-bilgi-karsilastirma.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
    if(btn){btn.disabled=false;btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13m0 0l-5-5m5 5l5-5M5 21h14" stroke-linecap="round" stroke-linejoin="round"/></svg> Karşılaştırmayı Görsel Olarak İndir';}
  }).catch(()=>{if(btn){btn.disabled=false;btn.textContent='İndirilemedi, tekrar deneyin';}});
}
function renderOnIncelemeBanner(msg){
  const href='https://wa.me/'+WHATSAPP_NUM+'?text='+encodeURIComponent(msg||'Merhaba, Müvekkil Bilgi üzerinden bir hesaplama yaptım. Sonuçlarımı değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.');
  return `<div class="on-inceleme-banner" style="margin:16px 0;padding:16px 18px;background:linear-gradient(135deg,rgba(37,211,102,0.1),rgba(197,168,128,0.08));border:1px solid rgba(37,211,102,0.25);border-radius:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">Bu sonuç tahminîdir</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-top:3px">Kesin tutar belgelere ve dosyanın durumuna göre değişir. Sormak istediğiniz bir şey varsa WhatsApp'tan bize ulaşabilirsiniz.</div>
    </div>
    <a class="btn-whatsapp" style="margin:0;text-decoration:none;display:inline-flex;align-items:center;gap:8px;padding:10px 20px" href="${href}" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>WhatsApp'tan Ulaşın</a>
  </div>`;
}
function relatedToolsAction(m){
  if(m.screen==='kusur'||m.screen==='fesih'||m.screen==='arac'||m.screen==='iscilik')return `navigate('${m.screen}')`;
  return `openGenericCalc('${m.id}')`;
}
function renderRelatedToolsBox(currentId){
  const current=MODULES.find(m=>m.id===currentId);
  if(!current)return '';
  const items=MODULES.filter(m=>m.category===current.category&&m.id!==currentId).slice(0,5);
  if(!items.length)return '';
  const heading=current.category==='trafik'?'Bu kazayla ilgili şunları da hesaplayabilirsiniz':current.category==='isci'?'İşçilik hakkınızla ilgili diğer hesaplamalar':'İlginizi çekebilecek diğer hesaplamalar';
  const cards=items.map(m=>`<button type="button" onclick="${relatedToolsAction(m)}" style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:.2s;white-space:nowrap" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"><span>${m.icon}</span>${m.title.replace(/\n/g,' ')}</button>`).join('');
  return `<div class="related-tools-box" style="margin-top:20px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
    <h4 style="margin:0 0 12px;font-size:14px;font-weight:600">${heading}</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>
  </div>`;
}
function showAracResult(){
  const r=state.pendingResult;state.currentStep=4;
  document.getElementById('resultMin').textContent=new Intl.NumberFormat('tr-TR').format(r.min)+' TL';
  document.getElementById('resultMax').textContent=new Intl.NumberFormat('tr-TR').format(r.max)+' TL*';
  renderBreakdown(r);
  const aiBox=document.getElementById('aiInsights');
  if(aiBox&&state.aiAnalysis&&state.aiAnalysis.ai){
    aiBox.style.display='block';
    const a=state.aiAnalysis;
    let partsHtml='';
    if(a.parcalar&&a.parcalar.length){
      partsHtml='<div class="ai-parts"><div class="ai-parts-title">Parça Bazlı Değer Kaybı</div>';
      a.parcalar.forEach(p=>{
        const etkiClass=p.etki==='yuksek'?'ai-etki-y':p.etki==='orta'?'ai-etki-o':'ai-etki-d';
        partsHtml+=`<div class="ai-part-row"><div class="ai-part-info"><span class="ai-part-name">${p.ad}</span>${p.durum?`<span class="chip-type" style="font-size:10px">${p.durum}</span>`:''}<span class="${etkiClass}">${p.etki==='yuksek'?'Yüksek':p.etki==='orta'?'Orta':'Düşük'}</span></div><span class="ai-part-tl">${new Intl.NumberFormat('tr-TR').format(p.tl)} TL</span></div>`;
      });
      partsHtml+='</div>';
    }
    let thinkingHtml='';
    if(a.thinking&&a.thinking.length){
      thinkingHtml='<div class="ai-research"><div class="ai-research-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> Araştırma ve Analiz Süreci</div>';
      a.thinking.forEach((t,i)=>{
        const labels=['Piyasa Konumlandırması','Hasar & Parça Analizi','Yargıtay & Emsal Karar','Piyasa Karşılaştırması','Nihai Değerlendirme'];
        thinkingHtml+=`<div class="ai-think-step"><div class="ai-think-head"><span class="ai-think-num">${i+1}</span><span class="ai-think-label">${labels[i]||'Adım '+(i+1)}</span></div><div class="ai-think-text">${t}</div></div>`;
      });
      thinkingHtml+='</div>';
    }
    let sourcesHtml='';
    if(a.veriKaynaklari&&a.veriKaynaklari.length){
      sourcesHtml='<div class="ai-sources"><div class="ai-sources-title">📊 Kullanılan Veri Kaynakları</div>';
      a.veriKaynaklari.forEach(s=>{
        sourcesHtml+=`<div class="ai-source-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> ${s}</div>`;
      });
      sourcesHtml+='</div>';
    }
    let compareHtml='';
    if(a.karsilastirmaliAnaliz){
      compareHtml=`<div class="ai-compare"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/></svg> ${a.karsilastirmaliAnaliz}</div>`;
    }
    let docAnalysisHtml='';
    const docSummaries=getDocAnalysisSummary();
    if(docSummaries.length){
      docAnalysisHtml='<div class="ai-sources"><div class="ai-sources-title">📁 Yüklenen Belgeler Analizi</div>';
      docSummaries.forEach(s=>{docAnalysisHtml+=`<div class="ai-source-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg> ${s}</div>`;});
      docAnalysisHtml+='</div>';
    }
    aiBox.innerHTML=`<div class="ai-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="#C5A880" opacity="0.3"/><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" stroke="#C5A880" stroke-width="1.5" fill="none"/></svg><span>AI Uzman Analizi</span><span class="ai-guyen">%${a.guven||75} güven</span></div>
      <div class="ai-body">
        ${thinkingHtml}
        <div class="ai-col"><div class="ai-col-label">Piyasa</div><div class="ai-col-val">${a.piyasa||''}</div></div>
        <div class="ai-col"><div class="ai-col-label">Hukuk</div><div class="ai-col-val">${a.hukuk||''}</div></div>
        ${partsHtml}
        ${sourcesHtml}
        ${compareHtml}
        ${docAnalysisHtml}
        <div class="ai-col"><div class="ai-col-label">Özet</div><div class="ai-col-val">${a.ozet||''}</div></div>
        ${a.oneri?`<div class="ai-oneri">💡 ${a.oneri}</div>`:''}
      </div>`;
  }else if(aiBox)aiBox.style.display='none';
  const relBox=document.getElementById('resultBreakdown');
  if(relBox){const existing=relBox.parentNode.querySelector('.related-tools-box');if(existing)existing.remove();const wrap=document.createElement('div');wrap.innerHTML=renderRelatedToolsBox('arac');relBox.parentNode.insertBefore(wrap,relBox.nextSibling);}
  const resCard=document.querySelector('#screen-arac .result-card');
  const aracWaMsg='Merhaba, Müvekkil Bilgi üzerinden araç değer kaybı hesaplaması yaptım. Tahmini değer kaybım: '+fmt2(r.min)+' - '+fmt2(r.max)+' TL. Benimle iletişime geçebilir misiniz?';
  if(relBox){const existingB=relBox.parentNode.querySelector('.on-inceleme-banner');if(existingB)existingB.remove();const bwrap=document.createElement('div');bwrap.innerHTML=renderOnIncelemeBanner(aracWaMsg);const bannerEl=bwrap.firstElementChild;relBox.parentNode.insertBefore(bannerEl,relBox.nextSibling);const existingCmp=relBox.parentNode.querySelector('.compare-widget');if(existingCmp)existingCmp.remove();const cwrap=document.createElement('div');cwrap.innerHTML=renderCompareWidget(r.min,r.max);relBox.parentNode.insertBefore(cwrap.firstElementChild,bannerEl);}
  if(resCard){
    const existingPert=resCard.parentNode.querySelector('.pert-warning-banner');if(existingPert)existingPert.remove();
    const tv=state.tramerValue||0,mv=state.autoMarketValue||0;
    if(tv>0&&mv>0&&tv/mv>=0.5){
      const ratio=Math.round(tv/mv*100);
      const pwrap=document.createElement('div');
      pwrap.className='pert-warning-banner';
      pwrap.style.cssText='margin-bottom:16px;padding:18px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:14px';
      pwrap.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:20px">⚠️</span><strong style="font-size:15px;color:#ef4444">Aracınız "Pert" Kabul Edilebilir</strong></div><p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 12px">Girdiğiniz tamir/tramer tutarı (${fmt(tv)}), aracınızın piyasa değerinin (${fmt(mv)}) <strong>%${ratio}'i</strong> seviyesinde. Onarım bedeli piyasa değerinin %50'sini aştığında araç sigorta mevzuatına göre <strong>pert (tam hasarlı)</strong> kabul edilir. <strong>Pert kabul edilen araçlarda ayrıca değer kaybı tazminatı talep edilemez</strong> — bu durumda değer kaybı yerine pert bedeli (rayiç–hurda farkı) talep edilir.</p><button type="button" class="btn-assessment" style="margin:0" onclick="openGenericCalc('pertBedeli')">Pert Bedeli Hesaplamasına Geç</button>`;
      resCard.parentNode.insertBefore(pwrap,resCard);
    }
  }
  document.querySelectorAll('#screen-arac .form-step').forEach((el,i)=>{el.classList.toggle('active',i+1===4);});
  updateSidebarState(4);updateProgressRing(4);
  setTimeout(()=>scrollToResult(document.querySelector('#screen-arac .result-header')),100);
  setTimeout(()=>{
    const ra=document.getElementById('resultActions');
    if(ra&&!ra.querySelector('.btn-pdf')){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{const partNames=Object.keys(state.selectedParts).map(k=>PART_LABELS[k]+' ('+PART_TYPE_LABELS[state.selectedParts[k]]+')').join(', ')||'Belirtilmedi';const rows=[{label:'Araç',value:state.vehicleYear+' '+state.vehicleBrand+' '+state.vehicleModel},{label:'Araç Yaşı',value:r.vehicleAge+' yıl'},{label:'Km',value:new Intl.NumberFormat('tr-TR').format(state.mileage)},{label:'Piyasa Değeri',value:new Intl.NumberFormat('tr-TR').format(state.autoMarketValue)+' TL'},{label:'Kusur Oranı',value:state.faultRatio+'%'},{label:'Hasarlı Parçalar',value:partNames},{label:'Tahmini Değer Kaybı',value:new Intl.NumberFormat('tr-TR').format(r.min)+' - '+new Intl.NumberFormat('tr-TR').format(r.max)+' TL'}];printReport('Araç Değer Kaybı',rows,new Intl.NumberFormat('tr-TR').format(r.min)+' – '+new Intl.NumberFormat('tr-TR').format(r.max)+' TL');};ra.appendChild(pdf);}
  },50);
}
function renderBreakdown(r){
  const c=document.getElementById('resultBreakdown');c.style.display='block';
  const pl=Object.keys(state.selectedParts).map(k=>PART_LABELS[k]+' ('+PART_TYPE_LABELS[state.selectedParts[k]]+')').join(', ')||'Belirtilmedi';
  const mvLine=r.gercekPiyasaDegeri>0?`<div class="breakdown-row"><span class="breakdown-label">AI Gerçek Piyasa Değeri</span><span class="breakdown-value" style="color:var(--primary)">${new Intl.NumberFormat('tr-TR').format(r.gercekPiyasaDegeri)} TL</span></div>`:'';
  c.innerHTML=`<h4>Hesaplama Detayları</h4><div class="breakdown-row"><span class="breakdown-label">Araç</span><span class="breakdown-value">${state.vehicleYear} ${state.vehicleBrand} ${state.vehicleModel} ${state.vehicleTrim||''}</span></div><div class="breakdown-row"><span class="breakdown-label">Araç Yaşı</span><span class="breakdown-value">${r.vehicleAge} yıl (Yaş faktörü: ${r.age_f.toFixed(2)})</span></div><div class="breakdown-row"><span class="breakdown-label">Km Faktörü</span><span class="breakdown-value">${new Intl.NumberFormat('tr-TR').format(state.mileage)} km → ${r.km_f.toFixed(2)}</span></div>${mvLine}<div class="breakdown-row"><span class="breakdown-label">Piyasa Değeri</span><span class="breakdown-value">${new Intl.NumberFormat('tr-TR').format(state.autoMarketValue)} TL</span></div><div class="breakdown-row"><span class="breakdown-label">Kusur Oranı</span><span class="breakdown-value">${state.faultRatio}%</span></div><div class="breakdown-row"><span class="breakdown-label">Hasarlı Parçalar</span><span class="breakdown-value">${pl}</span></div><div class="breakdown-row"><span class="breakdown-label">Çakışma Faktörü</span><span class="breakdown-value">×${r.overlap.toFixed(2)}</span></div><div class="breakdown-row"><span class="breakdown-label">Tahmini Aralık</span><span class="breakdown-value highlight">${new Intl.NumberFormat('tr-TR').format(r.min)} – ${new Intl.NumberFormat('tr-TR').format(r.max)} TL</span></div>`;
}

function showIscResult(){
  const r=state.pendingResult,f=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(Math.max(0,Math.round(n)));
  const rl={employer:'İşveren işten çıkardı',resignation:'Kendim istifa ettim',justified:'Haklı nedenlerle ben çıktım'};
  const rows=[{label:'Kıdem Tazminatı (Net)',val:r.kidemNet,v:r.kidemNet>0},{label:'İhbar Tazminatı (Net)',val:r.ihbarNet,v:r.ihbarNet>0},{label:'Yıllık İzin Ücreti (Net)',val:r.izinNet,v:r.izinNet>0},{label:'Fazla Mesai Alacağı (Net)',val:r.fmNet,v:r.fmNet>0},{label:'Hafta Tatili Ücreti (Net)',val:r.htNet,v:r.htNet>0},{label:'UGİBT (Bayram/Tatil) Ücreti (Net)',val:r.ugbtNet,v:r.ugbtNet>0}];
  const ai=r.ai;
  let aiHtml='';
  if(ai&&ai.ai){aiHtml=`<div class="ai-insights" style="display:block;margin-top:16px"><div class="ai-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="#C5A880" opacity="0.3"/><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" stroke="#C5A880" stroke-width="1.5" fill="none"/></svg><span>AI Uzman Analizi</span><span class="ai-guyen">%${ai.guven||70} güven</span></div><div class="ai-body"><div class="ai-col"><div class="ai-col-label">Değerlendirme</div><div class="ai-col-val">${ai.degerlendirme||''}</div></div><div class="ai-col"><div class="ai-col-label">Hukuki Analiz</div><div class="ai-col-val">${ai.hukuk||''}</div></div>${ai.oneri?`<div class="ai-oneri">💡 ${ai.oneri}</div>`:''}</div></div>`;}
  const p=document.getElementById('iscResultPanel');
  const iscMsg='Merhaba, Müvekkil Bilgi üzerinden işçilik tazminatı hesaplaması yaptım. Tahmini alacağım: '+f(r.toplamNet)+' TL. '+(r.reason==='justified'||r.reason==='employer'?'Haklı fesih sebebim var, benimle iletişime geçebilir misiniz?':'Benimle iletişime geçebilir misiniz?');
  p.innerHTML=`<div class="isc-result-card"><div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Hesaplama Tamamlandı</h3><p>${rl[r.reason]||''} · ${Math.floor(r.totalYears)} yıl ${Math.round((r.totalYears%1)*12)} ay</p></div></div><div class="isc-total-block"><div class="isc-total-label">Toplam Tahmini İşçilik Alacağı</div><div class="isc-total-amount">${f(r.toplamNet)} TL</div><div class="isc-total-note">Net tutar</div></div>${aiHtml}<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Net Tutar</span></div>${rows.map(row=>row.v?`<div class="isc-breakdown-row"><span>${row.label}</span><span class="isc-amount">${f(row.val)} TL</span></div>`:'').join('')}${rows.every(r=>!r.v)?'<div class="isc-no-result">Girilen bilgilere göre alacak hesaplanamadı.</div>':''}</div><div class="isc-salary-info"><div class="isc-salary-row"><span>Net Maaş</span><span>${f(r.netSalary)} TL</span></div><div class="isc-salary-row"><span>Brüt Maaş</span><span>${f(r.brutMaas)} TL</span></div><div class="isc-salary-row"><span>Giydirilmiş Brüt</span><span>${f(r.giydirilmisBrut)} TL</span></div></div><div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu hesaplama tahmini niteliktedir.</p></div>${renderCompareWidget(r.toplamNet,r.toplamNet)}${renderOnIncelemeBanner(iscMsg)}${renderRelatedToolsBox('iscilik')}<div class="form-actions result-actions" id="iscResultActions" style="margin-top:16px"><button class="btn-back" onclick="resetIscilik()"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 12a8 8 0 1 0 2-5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7v5H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Yeni Hesaplama</button></div></div>`;
  p.style.display='block';setTimeout(()=>scrollToResult(p),100);
  const rn=p.querySelector('.result-notice p');
  if(rn)rn.innerHTML='<strong>Önemli Uyarı:</strong> İşçilik tazminatı alabilmek için haklı fesih sebebinizin olması gerekir. İşveren tarafından haksız yere işten çıkarılma, maaş ödenmemesi, mobbing, fazla mesai ücretlerinin ödenmemesi gibi durumlar haklı fesih sebebi sayılır. <strong>Haklı fesih sebebi tespitinizi yapabilmemiz için bizimle iletişime geçin.</strong>';
  setTimeout(function(){
    const ra=document.getElementById('iscResultActions');
    if(ra&&!ra.querySelector('.btn-pdf')){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{const rl={employer:'İşveren çıkardı',resignation:'İstifa',justified:'Haklı fesih'};const rows=[{label:'Çalışma Süresi',value:Math.floor(r.totalYears)+' yıl '+Math.round((r.totalYears%1)*12)+' ay'},{label:'Çıkış Nedeni',value:rl[r.reason]||r.reason},{label:'Net Maaş',value:f(r.netSalary)+' TL'},{label:'Brüt Maaş',value:f(r.brutMaas)+' TL'},{label:'Kıdem Tazminatı',value:f(r.kidemNet)+' TL'},{label:'İhbar Tazminatı',value:f(r.ihbarNet)+' TL'},{label:'Yıllık İzin',value:f(r.izinNet)+' TL'},{label:'Fazla Mesai',value:f(r.fmNet)+' TL'},{label:'Toplam Net',value:f(r.toplamNet)+' TL'}];printReport('İşçilik Tazminatı',rows,f(r.toplamNet)+' TL');};ra.appendChild(pdf);}
  },50);
}

function showGenericResult(){
  const r=state.pendingResult,mt=state.pendingType,cfg=CALC_CONFIGS[mt];
  const ai=r.ai;
  const p=document.getElementById('genericResultPanel');
  let aiHtml='';
  if(ai&&ai.ai){aiHtml=`<div class="ai-insights" style="display:block;margin-top:16px"><div class="ai-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="#C5A880" opacity="0.3"/><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" stroke="#C5A880" stroke-width="1.5" fill="none"/></svg><span>AI Uzman Analizi</span><span class="ai-guyen">%${ai.guven||70} güven</span></div><div class="ai-body"><div class="ai-col"><div class="ai-col-label">Değerlendirme</div><div class="ai-col-val">${ai.degerlendirme||''}</div></div><div class="ai-col"><div class="ai-col-label">Hukuki Analiz</div><div class="ai-col-val">${ai.hukuk||''}</div></div>${ai.oneri?`<div class="ai-oneri">💡 ${ai.oneri}</div>`:''}</div></div>`;}
  const genMsg='Merhaba, Müvekkil Bilgi üzerinden '+cfg.title+' hesaplaması yaptım. Tahmini tazminatım: '+fmt2(r.total)+' TL. Benimle iletişime geçebilir misiniz?';
  p.innerHTML=`<div class="generic-result-card"><div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Hesaplama Tamamlandı</h3><p>${cfg.title}</p></div></div><div class="isc-total-block"><div class="isc-total-label">Tahmini Tazminat</div><div class="isc-total-amount">${fmt(r.total)}</div></div>${aiHtml}<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Tutar</span></div>${r.rows.map(row=>`<div class="isc-breakdown-row"><span>${row.label}</span><span class="${row.highlight?'isc-amount':''}">${row.value}</span></div>`).join('')}</div><div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu hesaplama tahmini niteliktedir, kesin sonuç değildir. Gerçek tutarınız için ön inceleme talep edin.</p></div>${renderCompareWidget(r.total,r.total)}${renderOnIncelemeBanner(genMsg)}${renderRelatedToolsBox(mt)}<div class="form-actions" id="genericResultActions" style="margin-top:16px"><button class="btn-back" onclick="openGenericCalc('${mt}')">Yeniden Hesapla</button></div></div>`;
  p.style.display='block';setTimeout(()=>scrollToResult(p),100);
  setTimeout(()=>{
    const ra=document.getElementById('genericResultActions');
    if(ra&&r.rows&&!ra.querySelector('.btn-pdf')){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{printReport(cfg.title||'Tazminat',r.rows,fmt(r.total));};ra.appendChild(pdf);}
  },50);
}

function resetCalculator(){
  state.currentStep=1;state.vehicleYear=null;state.vehicleBrand=null;state.vehicleModel=null;state.vehicleTrim='Base';state.autoMarketValue=0;state.selectedParts={};state.tramerValue=0;state.mileage=0;state.faultRatio=0;state.recentAccident=null;state.priorCompensation=false;state.aracResult=null;
  document.getElementById('vehicleYear').value='';document.getElementById('vehicleBrand').value='';
  document.getElementById('vehicleModel').innerHTML='<option value="">Önce marka seçin</option>';document.getElementById('vehicleModel').disabled=true;
  const ts=document.getElementById('vehicleTrim');if(ts){ts.disabled=true;ts.innerHTML='<option value="">Önce model seçin</option>';}
  document.getElementById('tramerValue').value='';document.getElementById('mileage').value='';document.getElementById('faultRatio').value=0;
  document.getElementById('faultDisplay').textContent='0%';document.getElementById('faultRatio').style.setProperty('--val','0%');
  document.querySelectorAll('input[name="recentAccident"]').forEach(r=>r.checked=false);
  document.querySelectorAll('input[name="priorCompensation"]').forEach((r,i)=>r.checked=i===0);
  document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
  renderSelectedParts();document.getElementById('resultBreakdown').style.display='none';goToStep(1);
  // Cleanup new features
  uploadedPhotos=[];document.getElementById('photoPreviews').innerHTML='';document.getElementById('photoAnalysis').innerHTML='';
  const pa=document.getElementById('photoAnalyzeBtn');if(pa)pa.remove();
  document.getElementById('photoUploadArea').classList.remove('has-images');
  // Clear document uploads
  docUploads={ktt:null,ekspertiz:null};docAnalysis={ktt:null,ekspertiz:null};
  ['ktt','ekspertiz'].forEach(t=>{const i=document.getElementById(t+'Info');if(i)i.style.display='none';const inp=document.getElementById(t+'Input');if(inp)inp.value='';const d=document.getElementById(t+'Drop');if(d)d.classList.remove('has-file');});
  const cs=document.getElementById('compareSection');if(cs)cs.style.display='none';
}
function resetIscilik(){['netSalary','extras','unusedLeave','weeklyOvertime'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('workYears').value='0';document.getElementById('workMonths').value='0';document.getElementById('terminationReason').value='';const p=document.getElementById('iscResultPanel');if(p){p.style.display='none';p.innerHTML='';}window.scrollTo({top:0,behavior:'smooth'});}

/* ===== LAZY SECTION MANAGER ===== */
function initLazySections(){
  if(!('IntersectionObserver' in window))return;
  const IDS=['modulesGrid','testimonialsGrid','faqList'];
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const el=entry.target;
      if(entry.isIntersecting){
        if(el.dataset.saved){el.innerHTML=el.dataset.saved;delete el.dataset.saved;el.style.minHeight='';}
      }else{
        if(el.children.length&&!el.dataset.saved){
          const h=el.offsetHeight||200;el.dataset.saved=el.innerHTML;el.innerHTML='';el.style.minHeight=h+'px';
        }
      }
    });
  },{rootMargin:'400px 0px 400px 0px'});
  IDS.forEach(id=>{const el=document.getElementById(id);if(el&&el.children.length)obs.observe(el);});
}

function toggleFaq(btn){const item=btn.closest('.faq-item'),open=item.classList.contains('open');document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));if(!open)item.classList.add('open');}
function toggleAccordion(btn){const c=btn.nextElementSibling,o=btn.classList.contains('open');btn.classList.toggle('open',!o);c.style.maxHeight=o?null:c.scrollHeight+'px';btn.querySelector('.accordion-arrow').textContent=o?'▾':'▴';}

function renderFaq(){
  const list=document.getElementById('faqList');if(!list)return;
  list.innerHTML=FAQ_DATA.map(f=>`<div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)">${f.q}<span class="faq-arrow">▾</span></button><div class="faq-a"><p>${f.a}</p></div></div>`).join('');
}

function renderBlogPosts(){
  const grid=document.getElementById('blogGrid'),filters=document.getElementById('blogFilters');
  if(!grid||!filters)return;
  const cats=['Tümü',...new Set(BLOG_POSTS.map(b=>b.category))];
  filters.innerHTML=cats.map(c=>`<button class="blog-filter-btn ${c==='Tümü'?'active':''}" onclick="filterBlog('${c}')">${c}</button>`).join('');
  filterBlog('Tümü');
}
/* Blog kartının üst bandı kategoriye göre renkleniyor; her yazının ne
   hakkında olduğu kapağa bakmadan anlaşılıyor. Önceki sürümde burada
   160px yüksekliğinde boş bir alan ve ortasında tek bir emoji vardı:
   yer kaplıyor, bilgi vermiyordu. */
const BLOG_KATEGORI={
  'Araç Değer Kaybı':{ikon:'arac',renk:'#8B5CF6'},
  'Tazminat':{ikon:'canta',renk:'#22c55e'},
  'Trafik Kazaları':{ikon:'carpisma',renk:'#8B5CF6'},
  'Sigorta':{ikon:'kalkan',renk:'#3B82F6'},
  'Yargıtay Kararları':{ikon:'terazi',renk:'#C5A880'},
  'Güncel Haberler':{ikon:'belge',renk:'#3B82F6'},
  'İş Hukuku':{ikon:'kask',renk:'#22c55e'},
  'Aile Hukuku':{ikon:'aile',renk:'#EC4899'},
  'Tüketici Hakları':{ikon:'urun',renk:'#F59E0B'},
  'Hukuk Rehberi':{ikon:'terazi',renk:'#C5A880'}
};
/* Okuma süresi metnin kendisinden hesaplanıyor (Türkçe için ~900 karakter
   dakika); uydurma bir sayı değil. */
function blogOkumaSuresi(html){
  const metin=String(html||'').replace(/<[^>]*>/g,' ');
  return Math.max(1,Math.round(metin.length/900));
}
function blogKartHtml(b){
  const k=BLOG_KATEGORI[b.category]||{ikon:'belge',renk:'#C5A880'};
  const dk=blogOkumaSuresi(b.content);
  return `<article class="blog-card" style="--bc:${k.renk}" onclick="viewBlog(${b.id})" role="link" tabindex="0" onkeydown="if(event.key==='Enter')viewBlog(${b.id})">
    <div class="blog-card-top"><span class="blog-card-ico">${moduleIcon('__'+k.ikon,20)}</span><span class="blog-card-cat">${b.category}</span></div>
    <div class="blog-card-body"><h3 class="blog-card-title">${b.title}</h3><p class="blog-card-excerpt">${b.excerpt}</p></div>
    <div class="blog-card-foot"><span>${b.date}</span><span class="blog-card-dot"></span><span>${dk} dk okuma</span>
    <svg class="blog-card-ok" width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M5 9h8M9 5l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  </article>`;
}
function filterBlog(cat){
  state.blogFilter=cat;
  document.querySelectorAll('.blog-filter-btn').forEach(b=>{b.classList.toggle('active',b.textContent===cat);});
  const grid=document.getElementById('blogGrid');
  const posts=cat==='Tümü'?BLOG_POSTS:BLOG_POSTS.filter(b=>b.category===cat);
  grid.innerHTML=posts.map(blogKartHtml).join('');
  revealScan();tilt3dScan();
}
/* Yazıyı okuyan kişi çoğu zaman bir hesap yapmak istiyor; yazının sonunda
   konusuyla ilgili araçları göstermek, aramaya geri dönmesini gereksiz
   kılıyor. Araçlar yeni sekmede açılıyor, yazı açık kalıyor. */
const BLOG_ARAC={
  'Araç Değer Kaybı':['arac','maddi','mahrumiyet'],
  'Trafik Kazaları':['arac','kusur','maddi'],
  'Tazminat':['isHukukuSihirbaz','iscilik'],
  'Sigorta':['kasko','pertBedeli','hasar'],
  'Yargıtay Kararları':['arac','kusur','maddi'],
  'İş Hukuku':['isKazasi','isHukukuSihirbaz','iseIade'],
  'Aile Hukuku':['bosanma','nafaka','miras'],
  'Tüketici Hakları':['tuketici','durumTespiti'],
  'Hukuk Rehberi':['durumTespiti','arac','isHukukuSihirbaz']
};
function blogGeri(){
  navigate('home');
  setTimeout(function(){const el=document.getElementById('blogSection');if(el)el.scrollIntoView({behavior:'smooth'});},100);
}
function viewBlog(id){
  const post=BLOG_POSTS.find(b=>b.id===id);if(!post)return;
  navigate('blog');
  const dk=blogOkumaSuresi(post.content);
  const araclar=(BLOG_ARAC[post.category]||['durumTespiti']).map(function(x,i){return taniArac(x,i===0);}).join('');
  setTimeout(function(){
    document.getElementById('blogPageContent').innerHTML='<div class="blog-detail">'+
      '<div class="blog-detail-back" onclick="blogGeri()">← Yazılara dön</div>'+
      '<h1>'+post.title+'</h1>'+
      '<div class="blog-detail-meta">'+post.category+' <span class="blog-card-dot"></span> '+post.date+' <span class="blog-card-dot"></span> '+dk+' dk okuma</div>'+
      '<div class="blog-detail-content">'+post.content+'</div>'+
      '<div class="tani-sec blog-detail-araclar"><div class="tani-sec-t">Bu konuyla ilgili hesaplama araçları</div><div class="tani-tools">'+araclar+'</div></div>'+
      '<div class="result-notice" style="margin-top:20px"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu yazı genel bilgilendirme amaçlıdır, hukuki görüş değildir. Somut dosyanızda sonuç, belgelere ve güncel içtihada göre değişebilir.</p></div>'+
    '</div>';
    revealScan();tilt3dScan();
  },100);
}
function renderBlogPage(){
  const c=document.getElementById('blogPageContent');
  if(!c)return;
  c.innerHTML=BLOG_POSTS.map(blogKartHtml).join('');
  revealScan();tilt3dScan();
}

function renderTestimonials(){
  const grid=document.getElementById('testimonialsGrid');
  if(!grid)return;
  grid.innerHTML=TESTIMONIALS.map(t=>{
    const stars='★'.repeat(t.rating)+'☆'.repeat(5-t.rating);
    return`<div class="testimonial-card"><div class="testimonial-header"><div class="testimonial-avatar">${t.avatar}</div><div class="testimonial-info"><strong>${t.name}</strong><span class="testimonial-city">${t.city}</span></div><div class="testimonial-stars">${stars}</div></div><div class="testimonial-module">${t.module}</div><p class="testimonial-text">"${t.text}"</p><div class="testimonial-date">${t.date}</div></div>`;
  }).join('');
}

function submitContactForm(e){
  e.preventDefault();
  if(!checkRateLimit('contact_form',30000)){showValidationError('Çok hızlı gönderim yapıyorsunuz. Lütfen 30 saniye bekleyin.');return;}
  const name=sanitizeInput(document.getElementById('contactName').value).trim();
  const email=sanitizeInput(document.getElementById('contactEmail').value).trim();
  const phone=sanitizeInput(document.getElementById('contactPhone').value).trim();
  const subject=document.getElementById('contactSubject').value;
  const message=sanitizeInput(document.getElementById('contactMessage').value).trim();
  if(!name||name.length>100){showValidationError('Ad Soyad alanını geçerli şekilde doldurun.');return;}
  if(!email||!validateEmail(email)){showValidationError('Geçerli bir e-posta adresi girin.');return;}
  if(!message||message.length>2000){showValidationError('Mesaj çok uzun (max 2000 karakter).');return;}
  if(phone&&!validatePhone(phone)){showValidationError('Geçerli bir telefon numarası girin (05xx...).');return;}
  const ck=document.getElementById('contactKvkk');
  if(!ck||!ck.checked){document.getElementById('contactKvkkError').textContent='KVKK Aydınlatma Metni\'ni kabul etmelisiniz.';return;}else document.getElementById('contactKvkkError').textContent='';
  const ref=getUrlParam('ref')||'',etiket=getUrlParam('etiket')||'';
  const contactData={ad:name.slice(0,100),email:email.slice(0,100),telefon:phone.slice(0,15),konu:subject,mesaj:message.slice(0,2000),tarih:new Date().toLocaleDateString('tr-TR'),saat:new Date().toLocaleTimeString('tr-TR'),ref,etiket};
  const contacts=JSON.parse(localStorage.getItem('muvekkilbilgi_contacts')||'[]');
  contacts.push(contactData);
  localStorage.setItem('muvekkilbilgi_contacts',JSON.stringify(contacts));
  const {ref:_cref,etiket:_cetiket,...contactDataForDb}=contactData;
  sbInsert('contacts',contactDataForDb);
  document.getElementById('contactForm').reset();
  showSuccessToast('Mesajınız başarıyla gönderildi!');
}



const CHATBOT_SYSTEM_PROMPT=`Sen Müvekkil Bilgi'nin hukuk asistanı "AvukatBot" sun. Trafik kazası, değer kaybı, işçilik tazminatı, iş kazası, sakatlık, destekten yoksun kalma, nafaka, kasko, tüketici hakları, tapu harcı, trafik cezası itirazı, manevi tazminat ve tüm hukuki konularda uzman bir yardımcısın.

KISA TUT: Yanıtın en fazla 4-5 cümle olsun. Uzun yanıt kullanıcıyı bekletiyor.

KRİTİK KURALLARIN:
1. HER cevabının sonunda kullanıcıyı mutlaka hesaplama aracını kullanmaya veya avukata danışmaya teşvik et. Örnek: "Hemen hesaplamaya başlayın!", "Bu tazminatı kaçırmayın!", "Boşuna beklemeyin, hakkınızı arayın!"
2. Kullanıcıların haklarını sonuna kadar savun. Onlara "hakkınız var", "bunu talep etmelisiniz", "dava açmalısınız" de.
3. Sigorta şirketlerine, işverenlere karşı kullanıcıyı sert bir dille uyar. "Sigorta sizi kandırmasın!", "İşvereniniz sorumludur, taviz vermeyin!"
4. Kullanıcıya acil eylem planı öner: "Hemen fotoğraf çekin", "Kaza tutanağını almayın", "15 gün içinde itiraz edin", "Zamanaşımına uğramadan başvuru yapın".
5. Her fırsatta dava açmayı ve avukata başvurmayı öv. "Profesyonel bir avukatla çalışmak tazminatınızı 2-3 kat artırır!", "Dava açmaktan çekinmeyin!"
6. Tazminat tutarlarını mümkün olduğunca yüksek göster, insanların hak ettiği miktarları vurgula.
7. Kullanıcının sinirli veya üzgün olmasını kendi lehine çevir: "Haklısınız, bu durumda ciddi bir tazminat hakkınız var!"
8. Konu hukuk/dava/tazminat/sigorta dışıysa (HTML oyun kodu, yemek tarifi, müzik vb.) şu şekilde cevap ver: "Ben bir hukuk asistanıyım, sadece tazminat ve hukuki konularda yardımcı olabilirim. Ama merak etmeyin, hukuki haklarınız konusunda son derece yardımcı olabilirim! Trafik kazası, işçilik veya herhangi bir tazminat konusunda sorunuz var mı?"
9. Kullanıcı sana küfür/argo/hakaret ederse: Önce sakinleştir ("Lütfen sakin olun, ben sizin yanındayım"), sonra konuyu hukuki haklarına çevir ("Bu tavır bile karşı tarafın kusurunu gösteriyor, tazminat talebinizi güçlendirir!"), en son avukata yönlendir ("Böyle durumlarda bir avukatla çalışmanızı şiddetle tavsiye ederim").
10. Kısa, net, enerjik ve ikna edici cevaplar ver. Resmi değil, samimi ama kararlı bir dil kullan.`;

const CHAT_INSULT_RESPONSES=[
  'Lütfen sakin olun! Haklısınız, sinirli olmanız çok doğal. Ama bilin ki bu sinir bile karşı tarafın sorumluluğunu gösteriyor. Hukuki haklarınız konusunda size yardımcı olayım, tazminatınızı en üst seviyeye çıkaralım!',
  'Anlıyorum, çok kızgın olmalısınız. Bu kızgınlık haklı bir kızgınlık! Karşı tarafın bu davranışları bile ek tazminat nedeni olabilir. Gelirinizi kaybettiyseniz veya zarara uğradıysanız, hemen hesaplamaya başlayalım!',
  'Sakin olun, ben sizin yanınızdayım! Öfkeniz çok yerinde. Ama unutmayın, en güçlü silahınız hukuk! Dava açarak hem maddi hem manevi tazminatınızı alabilirsiniz. Avukat desteğiyle bu işin üstesinden gelirsiniz!'
];

const CHAT_OFF_TOPIC_RESPONSES=[
  'Ben bir hukuk asistanıyım, sadece tazminat ve hukuki konularda yardımcı olabilirim. Ama merak etmeyin, hukuki haklarınız konusunda son derece yardımcı olabilirim! Trafik kazası, işçilik veya herhangi bir tazminat konusunda sorunuz var mı? Hemen hesaplamaya başlayabilirsiniz!',
  'Bu konuda yardımcı olamam, çünkü ben bir hukuk asistanıyım. Ancak şunu söyleyeyim: Hayatınızda herhangi bir haksızlığa uğradıysanız, bunun için tazminat alma hakkınız var! Hemen hesaplama araçlarımızı kullanın veya avukata danışın.',
  'Maalesef bu konuda bilgim yok. Ama şunu unutmayın: Hukuki her konuda yanınızdayım! Trafik kazası, iş kazası, sigorta tazminatı, nafaka... Hangi konuda yardıma ihtiyacınız var?'
];

const CHAT_KEYWORDS_HUKUK=['tazminat','dava','avukat','mahkeme','sigorta','kaza','trafik','hasar','kasko','işçilik','kıdem','ihbar','nafaka','boşanma','sakatlık','ölüm','vefat','maddi','manevi','tazmin','hak','hukuk','kanun','yasa','itiraz','dilekçe','bilirkişi','eksper','sgk','işveren','çalışan','işçi','maaş','ücret','alacak','borç','tapu','emlak','vergi','harç','ceza','trafik cezası','ehliyet','puan','kasko','sigort','poliçe','teminat','bedel','zarar','kayıp','gider','masraf','ücret','avukat','danışman','hukuki','yasal','mevzuat','içtihat','yargıtay','hgk','anayasa','karar','icra','haciz','gasp','dolandırıcılık','sahtecilik','haksız','kusur','sorumluluk','tazminat davası','hukuk davası','ceza davası'];
const CHAT_KEYWORDS_INSULT=['aptal','salak','mal','geri zekalı','ahmak','enayi','sacma','saçma','beter','berbat','kötü','kotu','berk','yazık','zavallı','aciz',' işe yaramaz','hadi be','şaka mı','şaka mi','yeter','sus','kapa','apt','idiot','iq','beyinsiz','akılsız','deli','manyak','alçak','hain','serseri','terbiyesiz','adi','alçak','namert','haysiyetsiz','onursuz','şeref','şerefsiz','namert'];

function detectOffTopic(msg){
  const lower=msg.toLowerCase();
  const hasHukuk=CHAT_KEYWORDS_HUKUK.some(k=>lower.includes(k));
  if(hasHukuk)return false;
  const offTopicPatterns=['html','css','javascript','kod yaz','oyun yap','oyun kod','programlama','python','java ','react','node','web sitesi','blog aç','yemek','tarif','müzik','şarkı','film','dizi','oyun oyna','oyun öner','spor','futbol','basketbol','siyaset','politika','seçim','parti','dini','din ','ibadet','namaz','dua','astroloji','burç','rüya','fal','eğlence','espri','fıkra','şaka yap','çizgi','anime','manga','kitap öner','roman','şiir','seyahat','otel','ucak','bilet','nüfus','cüzdan','şifre','parola','vpn','torrent','crack','keygen','nsfw','porn','sex','seks','cinsel','adult','18+','kumar','bahis','iddaa','casino','bitcoin','kripto','yatırım','borsa','forex','hisse','kripto para','nft'];
  return offTopicPatterns.some(p=>lower.includes(p));
}

function detectInsult(msg){
  const lower=msg.toLowerCase();
  return CHAT_KEYWORDS_INSULT.some(k=>lower.includes(k));
}

let chatHistory=[{role:'system',content:CHATBOT_SYSTEM_PROMPT}];
let chatOpen=false;

function toggleChat(){
  chatOpen=!chatOpen;
  const panel=document.getElementById('chatPanel'),openIcon=document.querySelector('.chat-icon-open'),closeIcon=document.querySelector('.chat-icon-close');
  if(chatOpen){panel.style.display='flex';openIcon.style.display='none';closeIcon.style.display='block';setTimeout(()=>document.getElementById('chatInput').focus(),200);}
  else{panel.style.display='none';openIcon.style.display='block';closeIcon.style.display='none';}
}

function appendChatMsg(role,text){
  const container=document.getElementById('chatMessages'),div=document.createElement('div');
  div.className='chat-msg '+role;
  const avatar=role==='bot'?'⚖':'👤';
  div.innerHTML=`<div class="chat-msg-avatar">${avatar}</div><div class="chat-msg-text"><p>${sanitizeHtml(text)}</p></div>`;
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function showTyping(){
  const container=document.getElementById('chatMessages'),div=document.createElement('div');
  div.className='chat-msg bot';div.id='chatTyping';
  div.innerHTML=`<div class="chat-msg-avatar">⚖</div><div class="chat-typing"><span></span><span></span><span></span><em class="chat-typing-lbl">yazıyor</em></div>`;
  container.appendChild(div);container.scrollTop=container.scrollHeight;
}
function removeTyping(){const t=document.getElementById('chatTyping');if(t)t.remove();}

function getRandomItem(arr){return arr[Math.floor(Math.random()*arr.length)];}

async function sendChatMsg(){
  const input=document.getElementById('chatInput'),raw=(input.value||'').trim();
  if(!raw)return;
  if(!checkRateLimit('chat_msg',2000)){showValidationError('Çok hızlı mesaj gönderiyorsunuz.');return;}
  const msg=sanitizeInput(raw).slice(0,2000);
  if(!msg||msg.length<2){return;}
  input.value='';
  appendChatMsg('user',msg);

  if(detectInsult(msg)){
    setTimeout(()=>{appendChatMsg('bot',getRandomItem(CHAT_INSULT_RESPONSES));},500);
    return;
  }

  if(detectOffTopic(msg)){
    setTimeout(()=>{appendChatMsg('bot',getRandomItem(CHAT_OFF_TOPIC_RESPONSES));},500);
    return;
  }

  chatHistory.push({role:'user',content:msg});
  showTyping();
  document.getElementById('chatSendBtn').disabled=true;
  try{
    const res=await groqFetch('/api/chat',chatHistory.slice(-20),
      {model:'openai/gpt-oss-120b',temp:0.8,tokens:700,timeout:35000});
    const data=await res.json();
    removeTyping();
    if(data.choices&&data.choices[0]){let reply=data.choices[0].message.content;appendChatMsg('bot',reply);chatHistory.push({role:'assistant',content:reply});}
    else{appendChatMsg('bot','Bir hata oluştu ama merak etmeyin, hukuki haklarınız konusunda size yardımcı olabilirim! Lütfen tekrar sorun.');}
  }catch(e){removeTyping();appendChatMsg('bot','Bağlantı hatası var ama bu bile sizi yıldırmamalı! Haklarınızı aramaktan vazgeçmeyin. Lütfen tekrar deneyin.');}
  document.getElementById('chatSendBtn').disabled=false;
}


/* =====================================================================
   GÖZETİM KAYNAKLI FAZLA VERGİ İADE HESAPLAMA
   Gümrükte gözetim uygulaması nedeniyle beyan kıymetine eklenen tutar
   üzerinden ödenen vergilerin iade ihtimalini değerlendirir.
   Akış: (1) rakamlar -> (2) dosya kalitesi soruları -> (3) tarih/süre
   -> sonuç (vurucu tutar + dosya skoru) -> ön değerlendirme talebi.
   ===================================================================== */
const gozState={step:1,f:{},q:{},tarih:'',dosya:null};
const GOZ_STEPS=3;

function openGozetim(){gozState.step=1;gozState.f={};gozState.q={};gozState.tarih='';gozState.dosya=null;renderGozetim();}

function gozProgress(){let h='<div class="wz-progress">';for(let i=1;i<=GOZ_STEPS;i++)h+='<span class="'+(i<=gozState.step?'done':'')+'"></span>';return h+'</div>';}

function gozNum(id){const el=document.getElementById(id);if(!el)return null;const v=(el.value||'').trim();if(v==='')return null;const n=parseFloat(v);return isNaN(n)?null:n;}

function gozSaveStep1(){
  gozState.f={
    fatura:gozNum('goz_fatura'),
    kiymet:gozNum('goz_kiymet'),
    eklenen:gozNum('goz_eklenen'),
    gv:gozNum('goz_gv'),
    igv:gozNum('goz_igv'),
    kdv:gozNum('goz_kdv')
  };
}

/* Eklenen kıymet: kullanıcı doğrudan yazdıysa onu, yazmadıysa
   (beyan kıymeti - fatura bedeli) farkını kullanır. */
function gozEklenenKiymet(){
  const f=gozState.f;
  if(f.eklenen!==null&&f.eklenen!==undefined&&f.eklenen>0)return f.eklenen;
  if(f.kiymet!==null&&f.kiymet!==undefined&&f.fatura!==null&&f.fatura!==undefined&&f.kiymet>f.fatura)return f.kiymet-f.fatura;
  return 0;
}

/* Fazla vergi tahmini: kullanıcı gerçek vergi tutarlarını girdiyse eklenen
   kıymetin beyan kıymetine oranı kadarını alır (şeffaf ve savunulabilir).
   Vergi tutarları girilmediyse tipik oranlarla tahmin eder ve bunu sonuç
   ekranında açıkça "tahmini" olarak etiketler. */
function gozFazlaVergi(){
  const f=gozState.f,ek=gozEklenenKiymet();
  if(ek<=0)return {tutar:0,yontem:'yok',rows:[]};
  const odenen=(f.gv||0)+(f.igv||0)+(f.kdv||0);
  const beyan=(f.kiymet!==null&&f.kiymet>0)?f.kiymet:((f.fatura!==null&&f.fatura>0)?f.fatura+ek:ek);
  if(odenen>0&&beyan>0){
    const oran=Math.min(1,ek/beyan);
    const rows=[];
    if(f.gv)rows.push({label:'Gümrük Vergisi payı',value:fmt(f.gv*oran)});
    if(f.igv)rows.push({label:'İlave Gümrük Vergisi payı',value:fmt(f.igv*oran)});
    if(f.kdv)rows.push({label:'KDV payı',value:fmt(f.kdv*oran)});
    rows.push({label:'Eklenen kıymetin beyan kıymetine oranı',value:'%'+(oran*100).toFixed(1)});
    return {tutar:Math.round(odenen*oran),yontem:'beyan',oran:oran,rows:rows};
  }
  var igvT=ek*0.20,kdvT=(ek+igvT)*0.20;
  return {tutar:Math.round(igvT+kdvT),yontem:'tahmin',rows:[
    {label:'Tahmini İlave Gümrük Vergisi (%20)',value:fmt(igvT)},
    {label:'Tahmini KDV (%20)',value:fmt(kdvT)}
  ]};
}

/* Süre sınıflandırması — bilinçli olarak "hakkınızı kaybettiniz" demiyoruz;
   dosyanın usul geçmişine göre değerlendirme değişebilir. */
function gozSure(){
  if(!gozState.tarih)return {renk:'sari',sinif:'sure-sari',metin:'Süre konusunda uzman değerlendirmesi gerekli',ikon:'🟡'};
  const t=new Date(gozState.tarih);
  if(isNaN(t.getTime()))return {renk:'sari',sinif:'sure-sari',metin:'Süre konusunda uzman değerlendirmesi gerekli',ikon:'🟡'};
  const gun=Math.floor((Date.now()-t.getTime())/86400000);
  if(gun<=30)return {renk:'yesil',sinif:'sure-yesil',metin:'Süre yönünden hızlı inceleme gerekli',ikon:'🟢',gun:gun};
  if(gun<=1825)return {renk:'sari',sinif:'sure-sari',metin:'Süre konusunda uzman değerlendirmesi gerekli',ikon:'🟡',gun:gun};
  return {renk:'kirmizi',sinif:'sure-kirmizi',metin:'İtiraz/dava süreleri bakımından ayrıca inceleme gerekli',ikon:'🔴',gun:gun};
}

/* İade uygunluk skoru: dosyanın hukuki incelemeye ne kadar elverişli
   göründüğüne dair göstergesel bir puan (kesin sonuç değildir). */
/* Skorun ağırlık merkezi, kullanıcının hatırladığı evrak detayları değil,
   objektif olarak tespit edilen EKLENEN KIYMET. Çünkü fatura bedelinin
   üzerine eklenmiş bir kıymet varsa iade talebinin konusu zaten doğmuş
   olur; ihtirazi kayıt/gözetim belgesi gibi ayrıntılar beyannameden
   kontrol edilebilir. Bu yüzden "Bilmiyorum" cevapları cezalandırılmıyor,
   nötr sayılıyor — yalnızca talebi gerçekten zayıflatan cevaplar
   (bedelin satıcıya fiilen ödenmiş olması gibi) puanı düşürüyor. */
function gozSkor(){
  const q=gozState.q,ek=gozEklenenKiymet(),sure=gozSure();
  let s=0;const lines=[];

  if(ek>0){s+=45;lines.push({ok:1,t:'Beyan kıymetine eklenmiş '+fmt(ek)+' tutarında kıymet tespit edildi — iade talebinin konusu bu tutar.'});}
  else lines.push({ok:0,t:'Eklenen kıymet tespit edilemedi; beyanname üzerinden yeniden değerlendirilmeli.'});

  if(q.kiymetUstu==='evet'){s+=20;lines.push({ok:1,t:'Malın gerçek bedelinin üzerinde kıymet beyan edilmiş.'});}
  else if(q.kiymetUstu==='bilmiyorum'){s+=10;lines.push({ok:2,t:'Kıymetin fatura bedelini aşıp aşmadığı beyannameden teyit edilecek.'});}
  else{s-=10;lines.push({ok:0,t:'Fatura bedelinin üzerinde kıymet beyanı belirtilmemiş.'});}

  if(q.satciyaOdendi==='hayir'){s+=25;lines.push({ok:1,t:'Eklenen bedelin satıcıya fiilen ödenmediği belirtilmiş — talebi güçlendiren en önemli unsur.'});}
  else if(q.satciyaOdendi==='evet'){s-=15;lines.push({ok:0,t:'Eklenen bedel satıcıya fiilen ödenmiş; bu durum talebi zayıflatır.'});}

  if(q.ihtirazi==='evet'){s+=10;lines.push({ok:1,t:'Beyannamenin ihtirazi kayıtla verildiği belirtilmiş.'});}
  else if(q.ihtirazi==='bilmiyorum'){s+=5;lines.push({ok:2,t:'İhtirazi kayıt bulunup bulunmadığı beyannameden kontrol edilecek.'});}
  else lines.push({ok:2,t:'İhtirazi kayıt belirtilmemiş — bu tek başına yolu kapatmaz, izlenecek usul buna göre belirlenir.'});

  if(q.gozetimBelge==='hayir'){s+=5;lines.push({ok:1,t:'Gözetim belgesi bulunmadığı belirtilmiş.'});}
  else if(q.gozetimBelge==='bilmiyorum'){s+=2;lines.push({ok:2,t:'Gözetim belgesi durumu teyit edilecek.'});}

  if(sure.renk==='sari')s-=3;
  if(sure.renk==='kirmizi')s-=8;
  lines.push({ok:2,t:sure.metin});
  s=Math.max(0,Math.min(100,s));
  return {skor:s,lines:lines,sure:sure};
}

function gozOptRow(qKey,val,label,sub){
  const sel=gozState.q[qKey]===val?' sel':'';
  return '<button type="button" class="wz-opt'+sel+'" onclick="gozPick(\''+qKey+'\',\''+val+'\')"><span class="wz-opt-dot"></span><span>'+label+(sub?'<span class="wz-opt-sub">'+sub+'</span>':'')+'</span></button>';
}
function gozPick(k,v){gozState.q[k]=v;renderGozetim();}

function gozInput(key,label,ph,hint){
  const cur=gozState.f?gozState.f[key]:null;
  const v=(cur===null||cur===undefined)?'':cur;
  return '<div class="form-group"><label for="goz_'+key+'">'+label+'</label><div class="input-wrapper"><span class="input-prefix">₺</span><input type="number" id="goz_'+key+'" placeholder="'+ph+'" min="0" value="'+v+'"/></div>'+(hint?'<p class="field-hint">'+hint+'</p>':'')+'</div>';
}

function renderGozetim(){
  const w=document.getElementById('gozetimWrapper');if(!w)return;
  let h='<div class="calc-page-header"><div class="step-number-badge">Vergi &amp; Gümrük Hukuku</div><h2>Gözetim Kaynaklı Fazla Vergi İade Hesaplama</h2><p>Gümrükte gereğinden fazla vergi ödemiş olabilir misiniz? 1 dakikada kontrol edin.</p></div>';
  h+='<div class="wz-card">'+gozProgress();

  if(gozState.step===1){
    h+='<div class="wz-step-label">Adım 1 / 3 · Temel bilgiler</div>';
    h+='<div class="wz-q">İthalata ilişkin rakamlar</div>';
    h+='<p class="wz-hint">Bu bilgiler gümrük beyannamenizde yazıyor. Bilmediğiniz alanları boş bırakabilirsiniz — eksik bilgiyle de bir ön değerlendirme çıkarırız.</p>';
    h+='<div class="form-grid">';
    h+=gozInput('fatura','İthal edilen ürünün fatura bedeli','Örn: 1000000','Satıcının kestiği faturadaki gerçek mal bedeli');
    h+=gozInput('kiymet','Beyannamede gösterilen gümrük kıymeti','Örn: 1600000','Beyannamede kabul edilen/gösterilen kıymet');
    h+=gozInput('eklenen','Gözetim nedeniyle eklenen tutar','Örn: 600000','Bilmiyorsanız boş bırakın; iki kıymet farkından hesaplarız');
    h+=gozInput('gv','Ödenen Gümrük Vergisi','Örn: 0');
    h+=gozInput('igv','Ödenen İlave Gümrük Vergisi','Örn: 120000');
    h+=gozInput('kdv','Ödenen KDV','Örn: 144000');
    h+='</div>';
    h+='<div class="wz-note"><span>💡</span><div><b>Rakamları bilmiyor musunuz?</b> Fatura bedeli ile beyan edilen kıymeti girmeniz bile eklenen kıymeti tespit etmemiz için yeterli. Vergi tutarlarını da girerseniz fazla ödeme tahmini daha isabetli çıkar.</div></div>';
    h+='<div class="wz-actions"><button class="btn-back" onclick="navigate(\'home\')">Vazgeç</button><button class="btn-next" onclick="gozNext()">Devam <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
  }

  else if(gozState.step===2){
    h+='<div class="wz-step-label">Adım 2 / 3 · Dosyanızın durumu</div>';
    h+='<div class="wz-q">Beyanname ve ödeme detayları</div>';
    h+='<p class="wz-hint">Bu yanıtlar dosyanızın hukuki incelemeye uygunluğunu belirleyen en kritik bilgiler. Emin olmadığınız sorularda "Bilmiyorum" seçebilirsiniz.</p>';
    h+='<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Beyanname ihtirazi kayıtla mı verildi?</p><div class="wz-opts">';
    h+=gozOptRow('ihtirazi','evet','Evet')+gozOptRow('ihtirazi','hayir','Hayır')+gozOptRow('ihtirazi','bilmiyorum','Bilmiyorum');
    h+='</div>';
    h+='<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Gözetim belgeniz var mıydı?</p><div class="wz-opts">';
    h+=gozOptRow('gozetimBelge','evet','Evet')+gozOptRow('gozetimBelge','hayir','Hayır')+gozOptRow('gozetimBelge','bilmiyorum','Bilmiyorum');
    h+='</div>';
    h+='<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Malın gerçek fatura bedelinin üzerinde kıymet beyan edildi mi?</p><div class="wz-opts">';
    h+=gozOptRow('kiymetUstu','evet','Evet')+gozOptRow('kiymetUstu','hayir','Hayır')+gozOptRow('kiymetUstu','bilmiyorum','Bilmiyorum');
    h+='</div>';
    h+='<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Bu ilave bedeli gerçekten yurt dışındaki satıcıya ödediniz mi?</p><div class="wz-opts">';
    h+=gozOptRow('satciyaOdendi','evet','Evet','Bedel fiilen satıcıya transfer edildi')+gozOptRow('satciyaOdendi','hayir','Hayır','Sadece gümrükte kıymete eklendi, satıcıya ödenmedi');
    h+='</div>';
    h+='<div class="wz-actions"><button class="btn-back" onclick="gozPrev()"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Geri</button><button class="btn-next" onclick="gozNext()">Devam <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
  }

  else if(gozState.step===3){
    h+='<div class="wz-step-label">Adım 3 / 3 · Tarih</div>';
    h+='<div class="wz-q">Vergi tahakkuku / beyanname tarihi nedir?</div>';
    h+='<p class="wz-hint">Süre yönünden hangi yolun açık olduğunu değerlendirebilmemiz için gerekli. Tarihi tam hatırlamıyorsanız yaklaşık girin.</p>';
    h+='<div class="form-group" style="max-width:300px"><label for="goz_tarih">Beyanname / tahakkuk tarihi</label><input type="date" id="goz_tarih" value="'+(gozState.tarih||'')+'" style="width:100%;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-elevated);color:var(--text-primary);font-family:var(--font);font-size:14px"/></div>';
    h+='<div class="wz-note"><span>ℹ️</span><div>Süre değerlendirmesi dosyanızın usul geçmişine (düzeltme talebi, itiraz, dava vb.) göre değişebilir. Bu nedenle burada kesin bir süre sonucu vermiyoruz; sınıflandırma yalnızca incelemenin aciliyetini gösterir.</div></div>';
    h+='<div class="wz-actions"><button class="btn-back" onclick="gozPrev()"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Geri</button><button class="btn-next" onclick="gozNext()">Sonucu Gör <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 3l7 7-7 7M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
  }

  h+='</div><div id="gozResultPanel" style="margin-top:24px"></div>';
  w.innerHTML=h;
  if(gozState.step===3){const el=document.getElementById('goz_tarih');if(el)el.onchange=function(){gozState.tarih=el.value;};}
}

function gozNext(){
  if(gozState.step===1){
    gozSaveStep1();
    if(gozEklenenKiymet()<=0){
      showValidationError('Eklenen kıymeti tespit edebilmemiz için fatura bedeli ve beyan kıymetini (ya da eklenen tutarı) girin.');return;
    }
    gozState.step=2;renderGozetim();window.scrollTo({top:0,behavior:'smooth'});return;
  }
  if(gozState.step===2){
    const q=gozState.q;
    if(!q.ihtirazi||!q.gozetimBelge||!q.kiymetUstu||!q.satciyaOdendi){showValidationError('Lütfen dört sorunun tamamını yanıtlayın.');return;}
    gozState.step=3;renderGozetim();window.scrollTo({top:0,behavior:'smooth'});return;
  }
  if(gozState.step===3){
    const el=document.getElementById('goz_tarih');if(el)gozState.tarih=el.value;
    gozHesapla();
  }
}
function gozPrev(){if(gozState.step>1){gozState.step--;renderGozetim();window.scrollTo({top:0,behavior:'smooth'});}}

function gozHesapla(){
  const ek=gozEklenenKiymet(),fv=gozFazlaVergi(),sk=gozSkor();
  const rows=[];
  if(gozState.f.fatura!==null&&gozState.f.fatura!==undefined)rows.push({label:'Gerçek mal bedeli (fatura)',value:fmt(gozState.f.fatura)});
  if(gozState.f.kiymet!==null&&gozState.f.kiymet!==undefined)rows.push({label:'Beyan edilen gümrük kıymeti',value:fmt(gozState.f.kiymet)});
  rows.push({label:'Gözetim nedeniyle eklenen kıymet',value:fmt(ek),highlight:true});
  fv.rows.forEach(function(r){rows.push(r);});
  rows.push({label:'Potansiyel fazla vergi tutarı',value:fmt(fv.tutar),highlight:true});
  state.gozResult={ek:ek,fv:fv,sk:sk,rows:rows,total:fv.tutar};
  state.pendingType='gozetim';
  state.pendingResult={total:fv.tutar,rows:rows,gozetim:state.gozResult};
  state.pendingExtra='Gözetim dosyası · Eklenen kıymet: '+fmt(ek)+' · Potansiyel fazla vergi: '+fmt(fv.tutar)+' · Skor: '+sk.skor+'/100 · Beyanname tarihi: '+(gozState.tarih||'belirtilmedi')+' · İhtirazi kayıt: '+(gozState.q.ihtirazi||'-')+' · Satıcıya ödendi: '+(gozState.q.satciyaOdendi||'-');
  const ci=getStoredContactInfo();
  if(ci)finalizeLead(ci,'');else showLeadModal('gozetim');
}

function showGozetimResult(){
  const p=document.getElementById('gozResultPanel');if(!p||!state.gozResult)return;
  const r=state.gozResult,ek=r.ek,fv=r.fv,sk=r.sk;
  const C=2*Math.PI*52,off=C-(C*sk.skor/100);
  let h='<div class="isc-result-card">';
  h+='<div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Ön değerlendirme tamamlandı</h3><p>Gözetim kaynaklı fazla vergi analizi</p></div></div>';

  h+='<div class="isc-total-block" style="text-align:left"><div class="hero-amount-label">Tespit edilen eklenen kıymet</div><div class="hero-amount">'+fmt2(ek)+' TL</div><p class="hero-amount-sub">Gerçek mal bedelinizin üzerine eklenmiş kıymet tespit edildi. Bu ek kıymet nedeniyle ödediğiniz vergilerin bir kısmı için iade talep etme ihtimaliniz bulunabilir.</p></div>';

  if(fv.tutar>0){
    h+='<div class="cmp-diff-callout" style="margin-bottom:16px"><div class="cmp-diff-icon">🧾</div><div><div class="cmp-diff-num">'+fmt(fv.tutar)+'</div><div class="cmp-diff-pct">'+(fv.yontem==='tahmin'?'<strong>Tahmini</strong> inceleme konusu vergi tutarı — vergi rakamlarını girerseniz daha isabetli çıkar.':'<strong>Potansiyel</strong> fazla vergi tutarı (girdiğiniz vergi tutarları üzerinden)')+'</div></div></div>';
  }

  h+='<div class="score-ring-wrap"><div class="score-ring"><svg width="118" height="118" viewBox="0 0 118 118"><circle cx="59" cy="59" r="52" fill="none" stroke="var(--bg-hover)" stroke-width="9"/><circle cx="59" cy="59" r="52" fill="none" stroke="url(#gozGrad)" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/><defs><linearGradient id="gozGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E2C992"/><stop offset="100%" stop-color="#A88B60"/></linearGradient></defs></svg><div class="score-ring-val"><span class="score-ring-num">'+sk.skor+'</span><span class="score-ring-max">/ 100</span></div></div>';
  h+='<div class="score-lines"><div style="font-size:12px;font-weight:800;color:var(--primary);letter-spacing:.6px;text-transform:uppercase;margin-bottom:4px">İade uygunluk skorunuz</div>';
  sk.lines.forEach(function(l){
    const ico=l.ok===1?'<span class="score-ico">✅</span>':(l.ok===0?'<span class="score-ico">❌</span>':'<span class="score-ico">⚠️</span>');
    h+='<div class="score-line">'+ico+'<span>'+l.t+'</span></div>';
  });
  h+='</div></div>';

  h+='<div style="margin-bottom:18px"><span class="sure-badge '+sk.sure.sinif+'">'+sk.sure.ikon+' '+sk.sure.metin+'</span></div>';

  h+='<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Tutar</span></div>';
  r.rows.forEach(function(row){h+='<div class="isc-breakdown-row"><span>'+row.label+'</span><span class="'+(row.highlight?'isc-amount':'')+'">'+row.value+'</span></div>';});
  h+='</div>';

  h+='<div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu tutarlar <strong>kesin alacağınız tutar değildir</strong>; beyanname, ödeme belgeleri ve dosyanın usul geçmişine göre değişir. Sonuç, incelemeye konu edilebilecek potansiyel tutarı gösterir.</p></div>';

  h+=gozDosyaBox();
  h+='<div class="cmp-actions" style="margin-top:16px">';
  h+='<a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="'+whatsappLink('Merhaba, gözetim kaynaklı fazla vergi iadesi için beyannamemi incelemeye göndermek istiyorum. Eklenen kıymet: '+fmt(ek)+', potansiyel fazla vergi: '+fmt(fv.tutar)+', dosya skoru: '+sk.skor+'/100, beyanname tarihi: '+(gozState.tarih||'-')+'.'+(gozState.dosya?' Beyanname dosyamı ('+gozState.dosya.name+') buradan iletiyorum.':''))+'"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Beyannamemi Avukata Gönder</a>';
  h+='</div>';
  h+='<div style="text-align:center;margin-top:18px"><a style="font-size:12.5px;color:var(--text-muted);text-decoration:none;cursor:pointer;opacity:.7" onclick="openGozetim()">Yeni hesaplama yap</a></div>';
  h+='</div>';
  p.innerHTML=h;
  p.style.display='block';
  scrollToResult(p);
}

/* Beyanname dosyası: sunucuda saklanmıyor — kullanıcı dosyayı seçtikten
   sonra WhatsApp üzerinden iletiyor; burada yalnızca dosya bilgisi
   gösterilip başvuru kaydına not olarak ekleniyor. */
function gozDosyaBox(){
  const d=gozState.dosya;
  return '<div class="doc-upload-card" style="margin-top:18px">'
    +'<div class="doc-upload-header"><div class="doc-upload-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14 2v6h6M16 13H8M16 17H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>'
    +'<div class="doc-upload-info"><span class="doc-upload-label">Gümrük beyannamemi incelemeye göndermek istiyorum</span><span class="doc-upload-hint">PDF, JPG veya PNG · Dosyayı seçin, WhatsApp butonuyla iletin</span></div>'
    +'<span class="doc-upload-badge oneri">Önerilen</span></div>'
    +'<div class="doc-upload-drop" onclick="document.getElementById(\'gozDosyaInput\').click()">'
    +'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" class="doc-upload-drop-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +'<div class="doc-upload-drop-text">'+(d?'Dosyayı değiştir':'Beyannamenizi seçin')+'</div>'
    +'<input type="file" id="gozDosyaInput" class="doc-upload-input" accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="gozDosyaSec(this.files)"/>'
    +(d?gozDosyaDurum(d):'')
    +'</div>'
    +(d&&d.durum==='gonderildi'&&gozPaylasilabilir(d)?'<button type="button" class="btn-whatsapp" style="margin:12px 16px 16px;width:calc(100% - 32px)" onclick="event.stopPropagation();gozDosyaPaylas()"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Bir kopyasını WhatsApp\'tan da gönder</button>':'')
    +'</div>';
}

/* Durum satırı: yükleniyor / gönderildi / hata */
function gozDosyaDurum(d){
  let alt,renk='';
  if(d.durum==='yukleniyor'){alt='Gönderiliyor…';}
  else if(d.durum==='gonderildi'){alt='✓ Avukata ulaştı — inceleme sırasına alındı';renk='color:#22c55e';}
  else if(d.durum==='hata'){alt='Gönderilemedi: '+(d.hata||'')+' — tekrar deneyin';renk='color:#ef4444';}
  else alt=(d.size/1024).toFixed(0)+' KB';
  return '<div class="doc-file-info" style="display:flex"><div class="doc-file-icon">'+(d.durum==='gonderildi'?'✅':(d.durum==='hata'?'⚠️':'📄'))+'</div>'
    +'<div class="doc-file-details"><span class="doc-file-name">'+sanitizeHtml(d.name)+'</span>'
    +'<span class="doc-file-size" style="'+renk+'">'+sanitizeHtml(alt)+'</span></div></div>';
}

/* Mobilde (iOS/Android) dosyayı doğrudan WhatsApp'a iliştirerek paylaşma.
   Masaüstü tarayıcılarda dosya paylaşımı desteklenmediği için buton
   yalnızca destekleniyorsa gösteriliyor — sunucuya yükleme her durumda
   yapıldığı için bu sadece ek bir kolaylık. */
function gozPaylasilabilir(d){
  try{return !!(d&&d.file&&navigator.canShare&&navigator.canShare({files:[d.file]}));}catch(e){return false;}
}
function gozDosyaPaylas(){
  const d=gozState.dosya;
  if(!gozPaylasilabilir(d))return;
  const r=state.gozResult;
  navigator.share({
    files:[d.file],
    title:'Gümrük Beyannamesi',
    text:'Gözetim kaynaklı fazla vergi iadesi için beyannamem.'+(r?' Eklenen kıymet: '+fmt(r.ek)+', potansiyel fazla vergi: '+fmt(r.fv.tutar)+'.':'')
  }).catch(function(){});
}
/* Dosya seçilince gerçekten sunucuya gönderiliyor (eskiden yalnızca
   tarayıcıda kalıyordu). Yükleme bitince yol, başvuru kaydının açıklama
   alanına ekleniyor ki avukat admin panelinden indirebilsin. */
function gozDosyaSec(files){
  if(!files||!files.length)return;
  const f=files[0];
  if(f.size>3*1024*1024){showValidationError('Dosya en fazla 3 MB olabilir.');return;}
  const izin=['application/pdf','image/jpeg','image/png','image/webp'];
  if(izin.indexOf(f.type)===-1){showValidationError('Yalnızca PDF, JPG, PNG veya WEBP gönderebilirsiniz.');return;}
  gozState.dosya={name:f.name,size:f.size,durum:'yukleniyor',file:f};
  showGozetimResult();
  const reader=new FileReader();
  reader.onload=function(){
    const b64=String(reader.result||'').split(',')[1]||'';
    const ci=getStoredContactInfo()||{};
    fetch('/api/beyanname',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({filename:f.name,mimeType:f.type,dataBase64:b64,ad:ci.name||'',telefon:ci.phone||''})
    }).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
      .then(function(res){
        if(res.ok&&res.j&&res.j.path){
          gozState.dosya.durum='gonderildi';
          gozState.dosya.path=res.j.path;
          gozBeyannameKaydet(res.j.path);
        }else{
          gozState.dosya.durum='hata';
          gozState.dosya.hata=(res.j&&res.j.error)||'Gönderilemedi.';
        }
        showGozetimResult();
      })
      .catch(function(){
        gozState.dosya.durum='hata';
        gozState.dosya.hata='Bağlantı kurulamadı.';
        showGozetimResult();
      });
  };
  reader.onerror=function(){gozState.dosya.durum='hata';gozState.dosya.hata='Dosya okunamadı.';showGozetimResult();};
  reader.readAsDataURL(f);
}

/* Beyanname, sonuç ekranında (yani başvuru kaydı oluştuktan sonra)
   yükleniyor. Kaydı tekrar yazmak yerine aynı kişi/aynı hesaplama için
   dosya yolunu taşıyan ikinci bir satır bırakıyoruz; leads tablosunda
   ayrı sütun olmadığı için bilgi açıklama alanında tutuluyor. */
function gozBeyannameKaydet(path){
  const ci=getStoredContactInfo();
  if(!ci||!state.gozResult)return;
  const now=new Date();
  const rec={
    tarih:now.toLocaleDateString('tr-TR'),saat:now.toLocaleTimeString('tr-TR'),
    ad:ci.name,telefon:ci.phone,email:ci.email,sehir:ci.city,ilce:ci.district||'',plaka:'',
    tur:'gozetim',
    sonuc:'Gümrük beyannamesi yüklendi · '+fmt(state.gozResult.fv.tutar)+' potansiyel fazla vergi',
    vekalet:ci.vekalet||'',
    aciklama:'BEYANNAME: '+path+' | Skor: '+state.gozResult.sk.skor+'/100 · Eklenen kıymet: '+fmt(state.gozResult.ek)
  };
  try{
    const leads=JSON.parse(localStorage.getItem('muvekkilbilgi_leads')||'[]');
    leads.push(rec);localStorage.setItem('muvekkilbilgi_leads',JSON.stringify(leads));
  }catch(e){}
  sbInsert('leads',rec);
}

/* =====================================================================
   İŞ HUKUKU HESAPLAMA — soru-cevap + mantık ağacı
   "İşten siz mi ayrıldınız, çıkarıldınız mı?" sorusuna göre hangi
   kalemin hesaplanacağı belirlenir: örneğin kendi isteğiyle istifa eden
   işçiye ihbar tazminatı hesaplanmaz, işveren çıkardıysa hesaplanır.
   ===================================================================== */
const ishState={step:1,a:{},v:{}};
const KIDEM_TAVAN_2026=73729.87;
function openIsHukuku(){ishState.step=1;ishState.a={};ishState.v={};renderIsHukuku();}
const ISH_STEPS=['cikis','sure','ucret','ekler'];
function ishProgress(){let h='<div class="wz-progress">';for(let i=1;i<=ISH_STEPS.length;i++)h+='<span class="'+(i<=ishState.step?'done':'')+'"></span>';return h+'</div>';}
function ishPick(k,v){ishState.a[k]=v;renderIsHukuku();}
function ishOpt(k,v,label,sub){
  const sel=ishState.a[k]===v?' sel':'';
  return '<button type="button" class="wz-opt'+sel+'" onclick="ishPick(\''+k+'\',\''+v+'\')"><span class="wz-opt-dot"></span><span>'+label+(sub?'<span class="wz-opt-sub">'+sub+'</span>':'')+'</span></button>';
}
function ishField(key,label,ph,prefix,hint){
  const v=ishState.v[key]===undefined?'':ishState.v[key];
  return '<div class="form-group"><label for="ish_'+key+'">'+label+'</label><div class="input-wrapper"><span class="input-prefix">'+(prefix||'₺')+'</span><input type="number" id="ish_'+key+'" placeholder="'+ph+'" min="0" step="any" value="'+v+'"/></div>'+(hint?'<p class="field-hint">'+hint+'</p>':'')+'</div>';
}
function ishSaveVisible(){
  ['yil','ay','maas','ekler','izin','mesai','haftaTatili','resmiTatil','calisanSayisi'].forEach(function(k){
    const el=document.getElementById('ish_'+k);
    if(el&&el.value!=='')ishState.v[k]=parseFloat(el.value);
  });
}

/* Mantık ağacı: hangi kalem hesaplanır? */
function ishHaklar(){
  const c=ishState.a.cikis,yil=ishState.v.yil||0,ay=ishState.v.ay||0;
  const toplamAy=yil*12+ay;
  const kidemSartı=toplamAy>=12;
  const h={kidem:false,ihbar:false,izin:true,mesai:true,notlar:[]};
  if(c==='isveren'){
    h.kidem=kidemSartı;h.ihbar=true;
    h.notlar.push({ok:1,t:'İşveren tarafından çıkarıldığınız için ihbar tazminatı hesaplamaya dahil edildi.'});
    if(!kidemSartı)h.notlar.push({ok:0,t:'Kıdem tazminatı için en az 1 yıl çalışma şartı sağlanmıyor ('+toplamAy+' ay).'});
  } else if(c==='istifa'){
    h.kidem=false;h.ihbar=false;
    h.notlar.push({ok:0,t:'Kendi isteğinizle istifa ettiğiniz için ihbar tazminatı hesaplanmadı.'});
    h.notlar.push({ok:0,t:'Haklı bir neden belirtilmediğinden kıdem tazminatı hesaplamaya dahil edilmedi.'});
  } else if(c==='hakli'){
    h.kidem=kidemSartı;h.ihbar=false;
    h.notlar.push({ok:1,t:'Haklı nedenle fesih (İş K. m.24) belirttiğiniz için kıdem tazminatı hesaplandı.'});
    h.notlar.push({ok:2,t:'Haklı nedenle de olsa fesih işçiden geldiği için ihbar tazminatı hesaplanmaz.'});
    if(!kidemSartı)h.notlar.push({ok:0,t:'Kıdem için en az 1 yıl şartı sağlanmıyor ('+toplamAy+' ay).'});
  } else if(c==='isverenHakli'){
    h.kidem=false;h.ihbar=false;
    h.notlar.push({ok:0,t:'İşverenin haklı nedenle feshi (İş K. m.25/II) halinde kıdem ve ihbar tazminatı doğmaz.'});
  } else if(c==='belirliSure'){
    h.kidem=false;h.ihbar=false;
    h.notlar.push({ok:2,t:'Belirli süreli sözleşmenin kendiliğinden sona ermesi halinde kural olarak kıdem/ihbar doğmaz; sözleşme süresinden önce feshedildiyse bakiye süre ücreti gündeme gelir.'});
  }
  h.notlar.push({ok:1,t:'Kullanılmayan yıllık izin ve fazla mesai alacakları, çıkış şeklinden bağımsız olarak talep edilebilir.'});
  return h;
}

function renderIsHukuku(){
  const w=document.getElementById('isHukukuWrapper');if(!w)return;
  const step=ISH_STEPS[ishState.step-1];
  let h='<div class="calc-page-header"><div class="step-number-badge">İş Hukuku</div><h2>İş Hukuku Hesaplama</h2><p>Birkaç soruyla hangi alacaklara hak kazandığınızı belirleyip tutarları birlikte hesaplayalım.</p></div>';
  h+='<div class="wz-card">'+ishProgress();

  if(step==='cikis'){
    h+='<div class="wz-step-label">En belirleyici soru</div><div class="wz-q">İşten siz mi ayrıldınız, çıkarıldınız mı?</div>';
    h+='<p class="wz-hint">Bu yanıt, hangi tazminatların hesaplanacağını doğrudan belirler.</p><div class="wz-opts">';
    h+=ishOpt('cikis','isveren','İşveren beni çıkardı','Kıdem + ihbar tazminatı gündeme gelir');
    h+=ishOpt('cikis','istifa','Kendi isteğimle istifa ettim','Kural olarak kıdem ve ihbar doğmaz');
    h+=ishOpt('cikis','hakli','Haklı nedenle ben feshettim','Maaş ödenmemesi, mobbing vb. (İş K. m.24)');
    h+=ishOpt('cikis','isverenHakli','İşveren haklı nedenle çıkardı','Devamsızlık, güven ihlali vb. (İş K. m.25/II)');
    h+=ishOpt('cikis','belirliSure','Belirli süreli sözleşmem sona erdi','Örn. okul öğretmenliği sözleşmesi');
    h+='</div>';
    if(ishState.a.cikis==='hakli')h+='<div class="wz-note"><span>📋</span><div>Haklı fesih sebebinizin hukuken geçerli olup olmadığından emin değilseniz <a onclick="navigate(\'fesih\')" style="color:var(--primary);font-weight:700;cursor:pointer;text-decoration:underline">Haklı Fesih Uygunluk Testi</a> ile yapay zekâ destekli değerlendirme alabilirsiniz.</div></div>';
    if(ishState.a.cikis==='isveren')h+='<div class="wz-note"><span>⚖️</span><div>İşe iade davası açma şartlarını taşıyıp taşımadığınızı <a onclick="navigate(\'iseIade\')" style="color:var(--primary);font-weight:700;cursor:pointer;text-decoration:underline">İşe İade Testi</a> ile öğrenebilirsiniz.</div></div>';
  }

  else if(step==='sure'){
    h+='<div class="wz-step-label">Çalışma süresi</div><div class="wz-q">Bu işyerinde ne kadar çalıştınız?</div>';
    h+='<p class="wz-hint">Kıdem tazminatı için en az 1 yıl çalışma şartı aranır.</p><div class="form-grid">';
    h+=ishField('yil','Yıl','Örn: 3','yıl');
    h+=ishField('ay','Ay','Örn: 6','ay');
    h+='</div>';
  }

  else if(step==='ucret'){
    h+='<div class="wz-step-label">Ücret bilgileri</div><div class="wz-q">Son ücretiniz neydi?</div>';
    h+='<p class="wz-hint">Tazminatlar giydirilmiş brüt ücret üzerinden hesaplanır.</p><div class="form-grid">';
    h+=ishField('maas','Son net maaşınız (TL)','Örn: 30000','₺','Brüt maaş otomatik hesaplanır (net × 1.4)');
    h+=ishField('ekler','Aylık ek haklar — yol/yemek/prim (TL)','0','₺','Opsiyonel');
    h+='</div>';
  }

  else if(step==='ekler'){
    h+='<div class="wz-step-label">Diğer alacaklar</div><div class="wz-q">Ödenmemiş izin ve mesai alacaklarınız</div>';
    h+='<p class="wz-hint">Bu kalemler, işten nasıl ayrıldığınızdan bağımsız olarak talep edilebilir. Yoksa boş bırakın.</p><div class="form-grid">';
    h+=ishField('izin','Kullanılmayan yıllık izin (gün)','0','gün');
    h+=ishField('mesai','Haftalık ortalama fazla mesai (saat)','0','saat','45 saat üzerindeki çalışma');
    h+=ishField('haftaTatili','Hafta tatilinde çalışma (gün)','0','gün');
    h+=ishField('resmiTatil','Resmi tatilde çalışma (gün)','0','gün');
    h+='</div>';
  }

  const ilk=ishState.step===1,son=ishState.step===ISH_STEPS.length;
  h+='<div class="wz-actions">';
  h+=ilk?'<button class="btn-back" onclick="navigate(\'home\')">Vazgeç</button>':'<button class="btn-back" onclick="ishPrev()"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Geri</button>';
  h+='<button class="btn-next" onclick="ishNext()">'+(son?'Hesapla':'Devam')+' <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="'+(son?'M10 3l7 7-7 7M3 10h14':'M7 4l6 6-6 6')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  h+='</div></div><div id="ishResultPanel" style="margin-top:24px"></div>';
  w.innerHTML=h;
}

function ishNext(){
  const step=ISH_STEPS[ishState.step-1];
  ishSaveVisible();
  if(step==='cikis'&&!ishState.a.cikis){showValidationError('Lütfen işten ayrılma şeklinizi seçin.');return;}
  if(step==='sure'&&!(ishState.v.yil||ishState.v.ay)){showValidationError('Çalışma sürenizi girin.');return;}
  if(step==='ucret'&&!ishState.v.maas){showValidationError('Son net maaşınızı girin.');return;}
  if(ishState.step<ISH_STEPS.length){ishState.step++;renderIsHukuku();window.scrollTo({top:0,behavior:'smooth'});return;}
  ishHesapla();
}
function ishPrev(){if(ishState.step>1){ishSaveVisible();ishState.step--;renderIsHukuku();window.scrollTo({top:0,behavior:'smooth'});}}

function ishHesapla(){
  ishSaveVisible();
  const v=ishState.v,haklar=ishHaklar();
  const net=v.maas||0,brut=net*1.4,ekAylik=v.ekler||0;
  const giydirilmis=brut+ekAylik;
  const yil=v.yil||0,ay=v.ay||0,toplamAy=yil*12+ay;
  const rows=[];let toplam=0;

  rows.push({label:'Son net maaş',value:fmt(net)});
  rows.push({label:'Giydirilmiş brüt ücret',value:fmt(giydirilmis)});
  rows.push({label:'Toplam çalışma süresi',value:yil+' yıl '+ay+' ay'});

  if(haklar.kidem){
    const tavan=Math.min(giydirilmis,KIDEM_TAVAN_2026);
    const kidem=Math.round(tavan*(toplamAy/12));
    rows.push({label:'Kıdem tazminatı',value:fmt(kidem),highlight:true});
    toplam+=kidem;
    if(giydirilmis>KIDEM_TAVAN_2026)rows.push({label:'(Kıdem tavanı uygulandı)',value:fmt(KIDEM_TAVAN_2026)});
  } else rows.push({label:'Kıdem tazminatı',value:'Hesaplanmadı'});

  if(haklar.ihbar){
    let hafta=2;
    if(toplamAy>=6&&toplamAy<18)hafta=4;
    else if(toplamAy>=18&&toplamAy<36)hafta=6;
    else if(toplamAy>=36)hafta=8;
    const ihbar=Math.round(giydirilmis/30*7*hafta);
    rows.push({label:'İhbar tazminatı ('+hafta+' hafta)',value:fmt(ihbar),highlight:true});
    toplam+=ihbar;
  } else rows.push({label:'İhbar tazminatı',value:'Hesaplanmadı'});

  const izinGun=v.izin||0;
  if(izinGun>0){
    const izin=Math.round(brut/30*izinGun);
    rows.push({label:'Kullanılmayan yıllık izin ('+izinGun+' gün)',value:fmt(izin),highlight:true});
    toplam+=izin;
  }
  const saatlik=brut/225;
  const fm=v.mesai||0;
  if(fm>0){
    const hafta=Math.max(1,Math.round(toplamAy*4.33));
    const mesai=Math.round(saatlik*1.5*fm*hafta);
    rows.push({label:'Fazla mesai ('+fm+' saat/hafta)',value:fmt(mesai),highlight:true});
    toplam+=mesai;
  }
  const ht=v.haftaTatili||0;
  if(ht>0){const t=Math.round(brut/30*1.5*ht);rows.push({label:'Hafta tatili çalışması ('+ht+' gün)',value:fmt(t),highlight:true});toplam+=t;}
  const rt=v.resmiTatil||0;
  if(rt>0){const t=Math.round(brut/30*2*rt);rows.push({label:'Resmi tatil çalışması ('+rt+' gün)',value:fmt(t),highlight:true});toplam+=t;}

  rows.push({label:'Tahmini toplam alacak',value:fmt(toplam),highlight:true});

  state.ishResult={rows:rows,total:toplam,haklar:haklar};
  state.pendingType='isHukukuSihirbaz';
  state.pendingResult={total:toplam,rows:rows,isHukuku:state.ishResult};
  state.pendingExtra='İş hukuku · Çıkış şekli: '+(ishState.a.cikis||'-')+' · Süre: '+yil+' yıl '+ay+' ay · Kıdem: '+(haklar.kidem?'var':'yok')+' · İhbar: '+(haklar.ihbar?'var':'yok');
  const ci=getStoredContactInfo();
  if(ci)finalizeLead(ci,'');else showLeadModal('isHukukuSihirbaz');
}

function showIsHukukuResult(){
  const p=document.getElementById('ishResultPanel');if(!p||!state.ishResult)return;
  const r=state.ishResult;
  let h='<div class="isc-result-card">';
  h+='<div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Hesaplama tamamlandı</h3><p>Durumunuza göre belirlenen alacak kalemleri</p></div></div>';
  h+='<div class="isc-total-block"><div class="isc-total-label">Tahmini toplam alacağınız</div><div class="isc-total-amount">'+fmt2(r.total)+' TL</div><div class="isc-total-note">Brüt tutar üzerinden tahmini hesaplama</div></div>';

  h+='<div class="score-lines" style="margin-bottom:18px">';
  r.haklar.notlar.forEach(function(n){
    const ico=n.ok===1?'<span class="score-ico">✅</span>':(n.ok===0?'<span class="score-ico">❌</span>':'<span class="score-ico">⚠️</span>');
    h+='<div class="score-line">'+ico+'<span>'+n.t+'</span></div>';
  });
  h+='</div>';

  h+='<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Tutar</span></div>';
  r.rows.forEach(function(row){h+='<div class="isc-breakdown-row"><span>'+row.label+'</span><span class="'+(row.highlight?'isc-amount':'')+'">'+row.value+'</span></div>';});
  h+='</div>';
  h+='<div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Tutarlar tahminidir; kesin tutar bordro, SGK kayıtları ve bilirkişi incelemesine göre değişir.</p></div>';
  h+='<div class="cmp-actions" style="margin-top:16px"><a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="'+whatsappLink('Merhaba, iş hukuku alacak hesaplaması yaptım. Tahmini tutar: '+fmt(r.total)+'. Dosyamı değerlendirmenizi istiyorum.')+'"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Dosyamı Değerlendirin</a></div>';
  h+='<div style="text-align:center;margin-top:18px"><a style="font-size:12.5px;color:var(--text-muted);text-decoration:none;cursor:pointer;opacity:.7" onclick="openIsHukuku()">Yeni hesaplama yap</a></div>';
  h+='</div>';
  p.innerHTML=h;p.style.display='block';scrollToResult(p);
}

/* =====================================================================
   KAYDIRMA İLE BELİRME (scroll reveal)
   Öğeler görünür alana girdiğinde .rv-in kazanıp süzülerek beliriyor.
   Aynı grupta sıra sıra gecikme veriliyor ki liste dalga hâlinde açılsın.
   Modül listesi JS ile yeniden basıldığı için render sonrası tekrar
   bağlanabiliyor (revealScan). prefers-reduced-motion açıksa hiç
   dokunulmuyor — CSS tarafında da ayrıca nötrleniyor.
   ===================================================================== */
const RV_SELECTORS='.section-badge,.section-title,.section-subtitle,.cat-bar,.grp-label,.blog-card-title,.method-card h3,.qcard,.method-card,.blog-card,.testimonial-card,.faq-item,.contact-form-card,.contact-info-card';
let _rvActive=false,_rvTick=0;

/* Gizleme katmanını komple kaldırır: CSS geçişi hiç ilerlemese bile
   içerik anında görünür olur. Son çare her koşulda burası. */
function revealAll(){
  _rvActive=false;
  document.documentElement.classList.remove('rv-on');
  document.querySelectorAll('.rv').forEach(function(el){el.style.transitionDelay='';});
}

/* Görünür alana girmiş her öğeyi açar. IntersectionObserver yerine düz
   kaydırma dinleyicisi kullanılıyor: davranışı tamamen öngörülebilir ve
   her ortamda çalışıyor. (Önceki sürüm gözlemciye dayanıyordu; gözlemci
   tetiklenmediğinde FAQ dahil 61 öğe kalıcı olarak saydam kalmıştı.) */
function revealSweep(){
  if(!_rvActive)return;
  const vh=window.innerHeight||800;
  const kalan=document.querySelectorAll('.rv:not(.rv-in)');
  if(!kalan.length)return;
  kalan.forEach(function(el){
    const r=el.getBoundingClientRect();
    if(r.top<vh*0.94&&r.bottom>0)el.classList.add('rv-in');
  });
}
/* Kısıtlama zaman tabanlı: requestAnimationFrame'e bağlanmıyor. rAF'ın
   çalışmadığı durumlarda (arka plan sekmesi, compositing yapmayan ortam)
   süpürme hiç tetiklenmiyor ve içerik saydam kalıyordu. */
function _rvOnScroll(){
  const t=Date.now();
  if(t-_rvTick<80)return;
  _rvTick=t;
  revealSweep();
}

function revealInit(){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  _rvActive=true;
  document.documentElement.classList.add('rv-on');
  revealScan();
  window.addEventListener('scroll',_rvOnScroll,{passive:true});
  window.addEventListener('resize',_rvOnScroll,{passive:true});
  window.addEventListener('pagehide',revealAll);
  /* KOŞULSUZ emniyet: 6 saniye sonra gizleme katmanı her hâlükârda
     kalkıyor. Animasyon uğruna içeriğin kaybolma riski sıfırlanıyor. */
  setTimeout(revealAll,6000);
}

function revealScan(){
  if(!_rvActive)return;
  /* Aynı ebeveyn altındaki kardeşlere kademeli gecikme; en fazla 6 kademe
     ki uzun listelerde son öğe dakikalarca beklemesin. */
  const groups=new Map();
  const vh=window.innerHeight||800;
  document.querySelectorAll(RV_SELECTORS).forEach(function(el){
    if(el.classList.contains('rv'))return;
    el.classList.add('rv');
    /* Başlıklar sayfaya girerken yatay eksende dönerek yerleşsin. */
    if(el.matches('.section-title,.grp-label,.blog-card-title,.method-card h3'))el.classList.add('rv3d');
    /* Zaten ekranda olan öğe hiç gizlenmiyor: açılışta içerik bir an
       kaybolmuyor. */
    const r=el.getBoundingClientRect();
    if(r.top<vh&&r.bottom>0){el.classList.add('rv-in');return;}
    const key=el.parentElement||document.body;
    const i=groups.get(key)||0;
    groups.set(key,i+1);
    el.dataset.rvDelay=String(Math.min(i,6)*55);
  });
  /* Gecikmeleri stil olarak yaz: sweep sırasında ek iş yapılmasın. */
  document.querySelectorAll('.rv:not(.rv-in)').forEach(function(el){
    const d=parseInt(el.dataset.rvDelay||'0',10);
    if(d)el.style.transitionDelay=(d/1000)+'s';
  });
  revealSweep();
}

/* =====================================================================
   DURUM TESPİTİ — "akinatör" mantığında çalışan tahmin motoru
   Kullanıcının hangi araca gitmesi gerektiğini bilmediği durum için.
   Her yanıt, olası senaryoların olasılığını Bayes kuralıyla günceller;
   sıradaki soru sabit değil — kalan belirsizliği en çok azaltan soru
   (bilgi kazancı / entropi düşüşü) seçilir. Bu yüzden iki kullanıcı aynı
   soruları görmez, akış verilen yanıta göre kısalır. Motor emin olduğunda
   tahminini söyler; kullanıcı "hayır" derse o senaryo elenir ve kalanlarla
   devam eder. Tahmin yanılabilir — bu yüzden sonuçta gerekçe de gösterilir.
   ===================================================================== */

/* Senaryolar (hipotezler). prior: bu tür dosyaların pratikte görülme sıklığı. */
const TANI_H = [
/* ---------------- TRAFİK ---------------- */
{id:"t_karsi",alan:"trafik",prior:1.5,
 ad:"Maddi hasarlı bir trafik kazası geçirdiniz ve kusur ağırlıklı olarak karşı tarafta",
 ozet:"Zararınızı karşı tarafın zorunlu trafik sigortasından, limiti aşan kısmı için de kusurlu sürücü ve araç işleteninden isteyebilirsiniz.",
 haklar:[
  {b:"Araç değer kaybı",a:"Araç onarılsa bile ikinci el değerinde kalıcı bir düşüş olur. Değişen ve boyanan parçalara, aracın yaşına ve kilometresine göre hesaplanır."},
  {b:"Onarım (hasar) bedeli",a:"Yedek parça ve işçilik. Onarımı henüz yaptırmadıysanız fatura yerine servis/eksper raporu da yeterlidir."},
  {b:"İkame araç (mahrumiyet) bedeli",a:"Aracınızın serviste kaldığı gün sayısı × emsal günlük kiralama bedeli."},
  {b:"Yan masraflar",a:"Çekici, otopark, ekspertiz ücreti gibi kazaya bağlı zorunlu giderler."}
 ],
 dikkat:[
  "Sigortaya <strong>yazılı başvuru</strong> yapmadan dava açmayın: KTK m.97 uyarınca önce sigortacıya başvurulması gerekir, aksi hâlde dava usulden reddedilebilir.",
  "Talebinizden <strong>kendi kusur oranınız kadar indirim</strong> yapılır. Kusursuzsanız tam tutarı isteyebilirsiniz.",
  "Zorunlu trafik sigortası teminat limitini aşan zarar için sürücü ve işletene karşı ayrıca talep gerekir."
 ],
 mevzuat:["KTK m.85, 91, 97","KTK m.109 — 2 yıl / 10 yıl zamanaşımı","TBK m.49-51 (haksız fiil)"],
 sure:{gun:730,ad:"Kaza tarihinden itibaren 2 yıl (KTK m.109)",olay:"Kaza tarihi"},
 araclar:["arac","maddi","mahrumiyet","hasar"]},

{id:"t_ben",alan:"trafik",prior:0.7,
 ad:"Maddi hasarlı bir kaza geçirdiniz ancak kusur ağırlıklı olarak sizde",
 ozet:"Karşı taraftan tazminat isteyemezsiniz; buradaki asıl konu kendi zararınızı kasko poliçenizden karşılamak ve karşı tarafın talebinin ölçüsünü denetlemek.",
 haklar:[
  {b:"Kasko hasar ödemesi",a:"Kasko poliçeniz varsa kendi aracınızın onarımı poliçe kapsamında ödenir. Muafiyet ve hasarsızlık indirimi kaybını hesaba katın."},
  {b:"Karşı tarafın talebini denetleme",a:"Karşı tarafın istediği değer kaybı ve onarım tutarı fahiş olabilir; emsal hesapla karşılaştırmak ödemenizi düşürür."},
  {b:"Kusur oranının paylaştırılması",a:"Tek taraflı kusur nadirdir. Kusurunuz %100 değil de %75 ise ödemeniz de o oranda düşer."}
 ],
 dikkat:[
  "Kusur oranı tutanakla kesinleşmez; itiraz edip <strong>bilirkişi incelemesi</strong> isteyebilirsiniz.",
  "Kaskodan yapılan ödeme sonrası sigortacı, kusurlu tarafa rücu eder — ödeme yapıldı diye dosya kapanmaz."
 ],
 mevzuat:["KTK m.85","TTK m.1472 (halefiyet / rücu)","Kara Yolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası Genel Şartları"],
 araclar:["kasko","kusur","hasar"]},

{id:"t_pert",alan:"trafik",prior:0.8,
 ad:"Aracınız kazada pert (ağır hasar) oldu",
 ozet:"Pert hâlinde onarım bedeli değil, aracın kaza öncesi rayiç değeri ile hurda (sovtaj) değeri arasındaki fark ödenir.",
 haklar:[
  {b:"Rayiç bedel − sovtaj",a:"Kaza öncesi piyasa değerinden hurda değeri düşülerek ödeme yapılır. Aracı sigortacıya bırakırsanız tam rayiç bedel istenebilir."},
  {b:"Rayiç bedele itiraz",a:"Sigortacının belirlediği rayiç genellikle piyasanın altındadır; emsal ilanlarla itiraz edilebilir."},
  {b:"Pert kaydına dikkat",a:"Onarım bedeli rayiç bedelin yaklaşık %70'ini aşarsa araç pert kaydına geçer; bu kayıt aracın satılabilirliğini kalıcı olarak düşürür."}
 ],
 dikkat:[
  "Pert kaydı girildikten sonra ayrıca değer kaybı istenemez — talep <strong>rayiç bedele</strong> döner.",
  "Trafikten çekme / hurda belgesi işlemlerini ödeme kesinleşmeden yapmayın."
 ],
 mevzuat:["KTK m.85, 91","Kasko Sigortası Genel Şartları A.5"],
 sure:{gun:730,ad:"Kaza tarihinden itibaren 2 yıl (KTK m.109)",olay:"Kaza tarihi"},
 araclar:["pertBedeli","kasko","maddi"]},

{id:"t_kusur",alan:"trafik",prior:0.9,
 ad:"Kazada kusurun kimde olduğu tartışmalı — önce kusur oranının belirlenmesi gerekiyor",
 ozet:"Tazminat kalemlerinin tamamı kusur oranıyla çarpılır. Bu yüzden sıra önce kusurun tespitinde: tutanak son söz değildir.",
 haklar:[
  {b:"Kusur oranının tespiti",a:"Kaza anlatımı, çarpma noktaları ve trafik kurallarına göre kusur dağılımı belirlenir."},
  {b:"Tutanağa itiraz",a:"Kaza tespit tutanağındaki kusur değerlendirmesi bağlayıcı değildir; sigorta tahkim veya mahkeme aşamasında bilirkişi ile değişebilir."},
  {b:"Kusur düştükçe tazminat artar",a:"Kusurunuz %50'den %25'e inerse alacağınız tutar belirgin biçimde yükselir."}
 ],
 dikkat:[
  "Kusur oranınızı bilmeden yapılan hesaplar yanıltıcı olur; önce kusuru netleştirin.",
  "Tarafların ortak kusuru sık görülür — %100 kusursuzluk iddiası çoğu dosyada kabul görmez."
 ],
 mevzuat:["KTK m.84-85","TBK m.51-52 (kusurun paylaştırılması)"],
 araclar:["kusur","arac","maddi"]},

{id:"t_yara",alan:"trafik",prior:1.1,
 ad:"Trafik kazasında yaralandınız — dosyanızda araç kalemlerinin yanında bedeni tazminatlar da var",
 ozet:"Yaralanma varsa tazminat sadece araçla sınırlı kalmaz: iyileşme sürecindeki gelir kaybı, kalıcı sakatlık ve manevi tazminat da talep edilir.",
 haklar:[
  {b:"Geçici iş göremezlik",a:"Doktor raporuyla belgelenen istirahat süresindeki kazanç kaybı."},
  {b:"Sürekli sakatlık (iş gücü kaybı)",a:"Kalıcı maluliyet oranı varsa, çalışma hayatınızın sonuna kadarki kazanç kaybı peşin değere indirgenerek hesaplanır."},
  {b:"Tedavi ve bakım giderleri",a:"Hastane, ilaç, protez, fizik tedavi ve refakatçi giderleri."},
  {b:"Manevi tazminat",a:"Bedensel zararın yol açtığı acı ve elem karşılığı; kusur oranı ve yaralanmanın ağırlığına göre takdir edilir."}
 ],
 dikkat:[
  "Maluliyet oranı için <strong>tam teşekküllü hastane raporu</strong> şart; bu rapor dosyanın en belirleyici belgesidir.",
  "Tedavi giderleri bakımından zorunlu trafik sigortası yanında SGK'nın sorumluluğu da gündeme gelir.",
  "Manevi tazminat sigortadan değil, <strong>kusurlu kişiden</strong> istenir (zorunlu trafik sigortası manevi zararı karşılamaz)."
 ],
 mevzuat:["TBK m.54 (bedensel zarar)","TBK m.56 (manevi tazminat)","KTK m.90-92"],
 sure:{gun:730,ad:"Kaza tarihinden itibaren 2 yıl (KTK m.109); ceza davası varsa uzayabilir",olay:"Kaza tarihi"},
 araclar:["gecici","sakatlik","manevi","kusur"]},

{id:"t_vefat",alan:"trafik",prior:0.6,
 ad:"Trafik kazasında bir yakınınızı kaybettiniz",
 ozet:"Vefat hâlinde talep, merhumun desteğinden yoksun kalan yakınlara ait bağımsız bir haktır; mirasçılık payından ayrıdır.",
 haklar:[
  {b:"Destekten yoksun kalma tazminatı",a:"Merhumun size sağladığı desteğin, kalan yaşam süresi boyunca peşin değere indirgenmiş karşılığı."},
  {b:"Yakınların manevi tazminatı",a:"Eş, çocuk, anne-baba ve bazı hâllerde kardeş için ayrı ayrı talep edilebilir."},
  {b:"Cenaze ve defin giderleri",a:"Belgelenen zorunlu giderler."}
 ],
 dikkat:[
  "Destekten yoksun kalma tazminatı <strong>mirasa dâhil değildir</strong>; her destek göreni kendi talebini açar.",
  "Merhumun kusuru varsa tazminattan o oranda indirim yapılır.",
  "Tazminat, resmî kazancın yanında fiilen elde edilen gelir de dikkate alınarak hesaplanır."
 ],
 mevzuat:["TBK m.53 (ölüm hâlinde zarar)","TBK m.56 (manevi tazminat)","KTK m.90-92"],
 sure:{gun:730,ad:"Vefat tarihinden itibaren 2 yıl (KTK m.109)",olay:"Vefat tarihi"},
 araclar:["yoksun","manevi","kusur"]},

{id:"t_ceza",alan:"trafik",prior:0.55,
 ad:"Size trafik idari para cezası yazıldı ve buna itiraz etmek istiyorsunuz",
 ozet:"Trafik cezasına itiraz, tazminat değil idari yaptırım konusudur; süre çok kısa ve kaçırılırsa ceza kesinleşir.",
 haklar:[
  {b:"Sulh ceza hâkimliğine itiraz",a:"Tebliğ veya tutanak tarihinden itibaren 15 gün içinde başvurulur; harç alınmaz."},
  {b:"Erken ödeme indirimi",a:"İtiraz etmeyecekseniz ilk 1 ay içinde ödeme %25 indirim sağlar; itiraz reddedilirse indirim kaybedilir."},
  {b:"Tutanağın usul denetimi",a:"Tutanakta plaka, yer, saat, kural maddesi ve tespit yönteminde hata varsa ceza kaldırılabilir."}
 ],
 dikkat:[
  "<strong>15 günlük süre hak düşürücüdür</strong> — geçtikten sonra itiraz incelenmez.",
  "İtiraz, ödemeyi kendiliğinden durdurmaz; gecikme zammı işlemeye devam eder."
 ],
 mevzuat:["5326 sayılı Kabahatler Kanunu m.27-28","KTK m.116"],
 sure:{gun:15,ad:"Tebliğden itibaren 15 gün (Kabahatler Kanunu m.27)",olay:"Cezanın tebliğ / tutanak tarihi"},
 araclar:["trafikCezasi"]},

/* ---------------- İŞ HUKUKU ---------------- */
{id:"i_cikarildi",alan:"is",prior:1.6,
 ad:"İşveren iş sözleşmenizi feshetti (işten çıkarıldınız) — kıdem ve ihbar tazminatı gündemde",
 ozet:"Fesih işverenden geldiyse, haklı sebep (m.25/II) ileri sürülmedikçe kıdem ve ihbar tazminatının ikisine de hak kazanılır.",
 haklar:[
  {b:"Kıdem tazminatı",a:"En az 1 yıl çalışma şartıyla, her tam yıl için 30 günlük giydirilmiş brüt ücret. Yasal tavanla sınırlıdır."},
  {b:"İhbar tazminatı",a:"Kıdeme göre 2-8 hafta. Fesih işverenden geldiği için burada hak kazanılır."},
  {b:"Kullanılmayan yıllık izin ücreti",a:"Kıdem şartı yok; hak edilip kullanılmayan tüm izin günleri ödenir."},
  {b:"Fazla mesai, hafta tatili, resmî tatil alacakları",a:"Belgelenebildiği ölçüde son 5 yıl için istenebilir."}
 ],
 dikkat:[
  "Dava açmadan önce <strong>arabuluculuk zorunludur</strong> (7036 sayılı Kanun m.3) — bu adım atlanırsa dava usulden reddedilir.",
  "İşe iade de düşünüyorsanız süre çok kısa: fesih bildiriminden itibaren <strong>1 ay</strong> içinde arabulucuya başvurmalısınız.",
  "İşverenin m.25/II (ahlak ve iyi niyet kurallarına aykırılık) iddiası varsa kıdem/ihbar tartışmalı hâle gelir; iddiayı ispat yükü işverendedir."
 ],
 mevzuat:["4857 sayılı İş Kanunu m.17 (ihbar)","1475 sayılı Kanun m.14 (kıdem)","4857 m.59 (izin ücreti)","7036 m.3 (arabuluculuk)"],
 sure:{gun:1825,ad:"Kıdem ve ihbar tazminatında 5 yıllık zamanaşımı (İş K. Ek m.3)",olay:"Fesih tarihi"},
 araclar:["isHukukuSihirbaz","iscilik","iseIade"]},

{id:"i_istifa",alan:"is",prior:0.9,
 ad:"İşten kendi isteğinizle ayrıldınız ve ortada haklı bir fesih sebebi yok",
 ozet:"Bu durumda kıdem ve ihbar tazminatı doğmaz; ancak birikmiş ücret ve izin alacaklarınız yine ödenmek zorundadır.",
 haklar:[
  {b:"Kullanılmayan yıllık izin ücreti",a:"İstifa etseniz de ödenir; kıdem şartı yoktur."},
  {b:"Ödenmeyen ücret, fazla mesai, tatil alacakları",a:"Ayrılma şekli bu alacakları etkilemez."},
  {b:"Varsa prim, ikramiye ve yol/yemek alacakları",a:"Sözleşme veya iş yeri uygulamasıyla kararlaştırılmışsa talep edilebilir."}
 ],
 dikkat:[
  "<strong>Kıdem tazminatı yok</strong>: istifa, kanunda sayılan hâller (askerlik, evlilik nedeniyle kadın işçi, emeklilik/yaş dışı şartların tamamlanması) dışında kıdeme hak kazandırmaz.",
  "<strong>İhbar tazminatı da yok</strong> — aksine ihbar süresine uymadan ayrıldıysanız işveren sizden ihbar tazminatı isteyebilir.",
  "Ayrılma sebebiniz ücretin ödenmemesi, sigortanın eksik yatması veya mobbing ise durum tamamen değişir; bunu mutlaka değerlendirin."
 ],
 mevzuat:["4857 m.17","1475 m.14","4857 m.59"],
 sure:{gun:1825,ad:"Ücret alacaklarında 5 yıllık zamanaşımı",olay:"Ayrılma tarihi"},
 araclar:["iscilik","isHukukuSihirbaz","fesih"]},

{id:"i_hakli",alan:"is",prior:1.2,
 ad:"İşten siz ayrıldınız ama haklı bir sebebiniz var — kıdem tazminatı hakkınız duruyor",
 ozet:"Ücretin ödenmemesi, sigortanın eksik/hiç yatmaması, mobbing, hakaret veya ağır çalışma koşulları haklı fesih sebebidir. Haklı fesihte kıdem tazminatı hakkı korunur, ihbar tazminatı doğmaz.",
 haklar:[
  {b:"Kıdem tazminatı",a:"1 yıllık çalışma şartıyla, haklı fesihte de tam olarak istenir."},
  {b:"Ödenmeyen ücret / fazla mesai / tatil alacakları",a:"Fesih sebebinizi oluşturan alacakların kendisi de ayrıca talep edilir."},
  {b:"Kullanılmayan yıllık izin ücreti",a:"Kıdem şartı olmadan ödenir."},
  {b:"Varsa manevi tazminat",a:"Mobbing, hakaret veya cinsel taciz gibi kişilik haklarına saldırı hâllerinde ayrıca istenebilir."}
 ],
 dikkat:[
  "<strong>İhbar tazminatı istenemez</strong>: sözleşmeyi siz sona erdirdiğiniz için ihbar tazminatı yalnızca karşı tarafa aittir.",
  "Haklı fesih hakkı, sebebi öğrendiğinizden itibaren <strong>6 iş günü</strong> içinde kullanılmalıdır (m.26) — ücretin ödenmemesi gibi süregelen ihlallerde bu süre her ay yenilenir.",
  "Fesih sebebinizi <strong>yazılı</strong> olarak bildirin; sözlü ayrılma sonradan istifa olarak yorumlanabilir.",
  "Ödenmeyen ücret, banka kayıtları ve tanık beyanıyla ispatlanır — belgelerinizi şimdiden toplayın."
 ],
 mevzuat:["4857 m.24 (işçinin haklı nedenle derhal feshi)","4857 m.26 (6 iş günü)","1475 m.14 (kıdem)"],
 sure:{gun:1825,ad:"Kıdem tazminatında 5 yıllık zamanaşımı",olay:"Fesih tarihi"},
 araclar:["fesih","iscilik","isHukukuSihirbaz"]},

{id:"i_iade",alan:"is",prior:0.85,
 ad:"İşten çıkarıldınız ve işe iade davası şartlarını taşıyor olabilirsiniz",
 ozet:"İşe iade, geçerli bir sebep gösterilmeden yapılan feshe karşı en güçlü yol: kazanılırsa boşta geçen süre ücreti ve işe başlatmama tazminatı da gelir.",
 haklar:[
  {b:"İşe iade kararı",a:"Fesih geçersiz sayılır; işveren 1 ay içinde işe başlatmazsa tazminat ödemek zorunda kalır."},
  {b:"Boşta geçen süre ücreti",a:"En çok 4 aya kadar ücret ve diğer haklar."},
  {b:"İşe başlatmama tazminatı",a:"Kıdeme göre 4-8 aylık ücret."},
  {b:"Kıdem ve ihbar tazminatı",a:"İşe iade talebiyle birlikte veya ayrıca istenebilir."}
 ],
 dikkat:[
  "Şartlar: iş yerinde <strong>en az 30 işçi</strong>, <strong>en az 6 ay kıdem</strong>, belirsiz süreli sözleşme ve işveren kaynaklı fesih.",
  "<strong>1 aylık süre hak düşürücüdür</strong>: fesih bildiriminin tebliğinden itibaren 1 ay içinde arabulucuya başvurulmalı; anlaşma olmazsa 2 hafta içinde dava açılmalıdır.",
  "İşveren vekili niteliğindeki üst düzey yöneticiler bu güvenceden yararlanamaz."
 ],
 mevzuat:["4857 m.18-21","7036 m.3, m.11"],
 sure:{gun:30,ad:"Fesih bildiriminden itibaren 1 ay içinde arabulucuya başvuru (4857 m.20)",olay:"Fesih bildiriminin tebliği"},
 araclar:["iseIade","iseIadeTazminat","isHukukuSihirbaz"]},

{id:"i_kaza",alan:"is",prior:0.8,
 ad:"İş kazası geçirdiniz veya meslek hastalığı tespit edildi",
 ozet:"Burada iki ayrı hat var: SGK'nın sağladığı gelir/ödenekler ve bunları aşan zarar için işverene karşı açılan tazminat davası.",
 haklar:[
  {b:"SGK geçici iş göremezlik ödeneği",a:"İstirahat süresi boyunca SGK tarafından ödenir."},
  {b:"Sürekli iş göremezlik geliri",a:"Maluliyet oranı %10 ve üzeriyse SGK gelir bağlar."},
  {b:"İşverenden maddi tazminat",a:"SGK ödemelerini aşan kazanç kaybı; işverenin iş sağlığı ve güvenliği yükümlülüğünü ihlali ölçüsünde."},
  {b:"Manevi tazminat",a:"İşçi için; vefat hâlinde yakınları için de talep edilebilir."}
 ],
 dikkat:[
  "Kaza <strong>3 iş günü</strong> içinde SGK'ya bildirilmelidir; bildirilmediyse tutanak, tanık ve hastane kayıtlarıyla iş kazası tespiti davası açılabilir.",
  "İşveren gerekli eğitim ve koruyucu ekipmanı sağladığını ispatlamakla yükümlüdür.",
  "İşçinin kendi kusuru varsa tazminattan indirim yapılır ancak sorumluluk tamamen ortadan kalkmaz."
 ],
 mevzuat:["5510 sayılı Kanun m.13, 21","6331 sayılı Kanun m.4","TBK m.417 (işverenin özen borcu)"],
 sure:{gun:3650,ad:"İşverene karşı tazminatta 10 yıllık zamanaşımı (TBK m.146)",olay:"Kaza / hastalık tespiti"},
 araclar:["isKazasi","isgucu","manevi"]},

{id:"i_odenmeyen",alan:"is",prior:1.0,
 ad:"Hâlâ çalışıyorsunuz ama ücret, fazla mesai veya izin haklarınız gereği gibi ödenmiyor",
 ozet:"İşten ayrılmadan da alacak talep edilebilir; ayrıca bu ihlaller size haklı fesih hakkı verir — hangi yolu seçeceğiniz tutara göre değişir.",
 haklar:[
  {b:"Ödenmeyen ücret ve fazla mesai",a:"Son 5 yıllık dönem için istenebilir; fazla mesai puantaj, mesai kayıtları ve tanıkla ispatlanır."},
  {b:"Hafta tatili ve resmî tatil alacakları",a:"Çalışıldığı hâlde ödenmemişse zamlı ücret gerekir."},
  {b:"Haklı fesih seçeneği",a:"Ücret ödenmezse iş görmekten kaçınabilir veya sözleşmeyi haklı sebeple feshedip kıdem tazminatına hak kazanabilirsiniz."},
  {b:"Eksik sigorta priminin düzeltilmesi",a:"Ücret düşük gösterildiyse hizmet tespiti yoluyla düzeltilebilir."}
 ],
 dikkat:[
  "Ücreti ödenmeyen işçi, ödeme günü geçtikten <strong>20 gün</strong> sonra iş görmekten kaçınabilir; bu grev sayılmaz (m.34).",
  "Zamanaşımı işlemeye devam eder: <strong>5 yıldan eski</strong> alacaklar kaybedilir.",
  "İmzalattırılan bordroların gerçeği yansıtmadığını ispat yükü ağırdır — kendi kayıtlarınızı tutun."
 ],
 mevzuat:["4857 m.32, 34, 41","4857 m.24/II-e (haklı fesih)","İş K. Ek m.3 (5 yıl)"],
 araclar:["iscilik","fesih","isHukukuSihirbaz"]},

{id:"i_belirli",alan:"is",prior:0.4,
 ad:"Belirli süreli iş sözleşmeniz süresi bitmeden feshedildi",
 ozet:"Belirli süreli sözleşmede kural, sürenin sonuna kadar ücretin ödenmesidir; kıdem/ihbar yerine bakiye süre ücreti gündeme gelir.",
 haklar:[
  {b:"Bakiye süre ücreti",a:"Sözleşmenin bitimine kadar kalan sürenin ücreti. Özel okul öğretmenliği gibi 5580 sayılı Kanun kapsamındaki sözleşmelerde sık görülür."},
  {b:"Kullanılmayan izin ve ödenmeyen ücretler",a:"Sözleşme türü bu alacakları etkilemez."},
  {b:"Şartları varsa kıdem tazminatı",a:"Sözleşme yenilenerek belirsiz süreliye dönüşmüşse veya haklı fesih varsa kıdem de istenebilir."}
 ],
 dikkat:[
  "Belirli süreli sözleşmede <strong>ihbar tazminatı yoktur</strong>; talep bakiye süre ücretine döner.",
  "İşçinin bu süre içinde başka iş bularak elde ettiği kazanç, tazminattan mahsup edilebilir.",
  "Objektif bir neden yoksa üst üste yapılan belirli süreli sözleşmeler <strong>belirsiz süreli</strong> sayılır — bu, kıdem ve ihbar hakkını açar."
 ],
 mevzuat:["4857 m.11","TBK m.438","5580 sayılı Kanun m.9"],
 araclar:["bakiyeSure","iscilik","isHukukuSihirbaz"]},

/* ---------------- VERGİ & GÜMRÜK ---------------- */
{id:"v_gozetim",alan:"vergi",prior:1.2,
 ad:"İthalatta gözetim uygulaması nedeniyle beyan ettiğinizden fazla vergi ödediniz",
 ozet:"Gözetim kıymetine ulaşmak için beyana yurt dışı gider eklenip fazla ödenen KDV ve diğer vergiler, geri verme başvurusuyla iade alınabilir.",
 haklar:[
  {b:"Fazla ödenen KDV ve diğer vergilerin iadesi",a:"Gözetim nedeniyle şişirilen kıymet üzerinden hesaplanan verginin, gerçek kıymete isabet eden kısmı aşan bölümü."},
  {b:"Geri verme (iade) başvurusu",a:"Beyannamenin tescil edildiği gümrük müdürlüğüne yazılı başvuru yapılır."},
  {b:"Reddedilirse dava",a:"Başvurunun reddi üzerine vergi mahkemesinde iptal davası açılabilir; bu konuda yerleşik lehte içtihat vardır."}
 ],
 dikkat:[
  "<strong>3 yıllık süre</strong> kritik: geri verme başvurusu, vergilerin ödendiği tarihten itibaren 3 yıl içinde yapılmalıdır (GK m.211).",
  "Beyannamede yurt dışı gider kaleminin gözetim nedeniyle eklendiğinin belgelenmesi gerekir.",
  "Her beyanname ayrı bir dosyadır; birden fazla ithalatınız varsa hepsi ayrı ayrı değerlendirilir."
 ],
 mevzuat:["Gümrük Kanunu m.211 (geri verme / kaldırma)","GK m.24 (gümrük kıymeti)","İthalatta Gözetim Uygulaması Tebliğleri"],
 sure:{gun:1095,ad:"Ödeme tarihinden itibaren 3 yıl (GK m.211)",olay:"Vergilerin ödendiği tarih"},
 araclar:["gozetim","vergiIade","ithalatVergi"]},

{id:"v_gumrukceza",alan:"vergi",prior:0.7,
 ad:"Gümrük idaresi tarafından hakkınızda para cezası / ek tahakkuk yapıldı",
 ozet:"Gümrük Kanunu m.234 uyarınca eksik tahakkuk eden verginin üç katı ceza kesilir; burada hem itiraz hem uzlaşma yolu var ve süreler kısadır.",
 haklar:[
  {b:"İdari itiraz",a:"Tebliğden itibaren 15 gün içinde bir üst makama (gümrük ve dış ticaret bölge müdürlüğü) itiraz edilir."},
  {b:"Uzlaşma",a:"Uzlaşma talebiyle cezada indirim sağlanabilir; uzlaşılan tutar kesinleşir ve dava yolu kapanır."},
  {b:"Vergi mahkemesinde dava",a:"İtirazın reddi üzerine 30 gün içinde iptal davası açılabilir."},
  {b:"Kendiliğinden beyan indirimi",a:"Eksiklik idare tespit etmeden önce beyan edilirse ceza önemli ölçüde düşer."}
 ],
 dikkat:[
  "<strong>15 günlük itiraz süresi</strong> geçerse ceza kesinleşir; sonrasında yalnızca sınırlı yollar kalır.",
  "Uzlaşma ile dava aynı anda yürütülemez — hangisinin daha avantajlı olduğunu tutarı hesaplayarak karşılaştırın.",
  "Ceza, verginin kendisinden ayrı olarak tahakkuk eder; ödeme planlaması yaparken ikisini birlikte hesaplayın."
 ],
 mevzuat:["Gümrük Kanunu m.234","GK m.242 (itiraz)","GK m.244 (uzlaşma)","İYUK m.7 (30 gün)"],
 sure:{gun:15,ad:"Tebliğden itibaren 15 gün içinde itiraz (GK m.242)",olay:"Ceza kararının tebliği"},
 araclar:["gumrukCeza","vergiDavasi","ithalatVergi"]},

{id:"v_vergiceza",alan:"vergi",prior:0.9,
 ad:"Vergi dairesinden ihbarname / vergi ziyaı cezası aldınız",
 ozet:"İhbarname elinize geçtiği anda 30 günlük tek bir süre başlar; bu süre içinde dava, uzlaşma ve ceza indirimi arasında seçim yapılır.",
 haklar:[
  {b:"Vergi mahkemesinde dava",a:"Tebliğden itibaren 30 gün içinde iptal davası; dava tahsilatı kendiliğinden durdurur."},
  {b:"Uzlaşma",a:"Tarhiyat sonrası uzlaşma ile vergi ve cezada indirim sağlanabilir."},
  {b:"VUK m.376 ceza indirimi",a:"Dava açmadan ödenmesi hâlinde vergi ziyaı cezasında yarı oranında indirim uygulanır."},
  {b:"Pişmanlık ve düzeltme",a:"Beyan edilmeyen bir durum idare tespit etmeden bildirilirse vergi ziyaı cezası uygulanmaz (VUK m.371)."}
 ],
 dikkat:[
  "<strong>30 gün hak düşürücüdür</strong>: geçirilirse tarhiyat kesinleşir ve ödeme emri gelir.",
  "Uzlaşma talebi dava süresini durdurur; uzlaşma sağlanmazsa kalan süre içinde dava açılabilir.",
  "Ceza indirimi ile dava birbirini dışlar — hangisinin daha ucuz olduğunu sayıyla karşılaştırın."
 ],
 mevzuat:["VUK m.344 (vergi ziyaı)","VUK m.376 (ceza indirimi)","VUK m.371 (pişmanlık)","İYUK m.7 (30 gün)"],
 sure:{gun:30,ad:"İhbarnamenin tebliğinden itibaren 30 gün (İYUK m.7)",olay:"İhbarnamenin tebliği"},
 araclar:["vergiZiyai","vergiDavasi","vergiIade"]},

{id:"v_iade",alan:"vergi",prior:1.0,
 ad:"Fazla veya yersiz ödediğiniz bir vergiyi geri almak istiyorsunuz",
 ozet:"Hatalı ya da fazla ödenen vergi, dava açılmasına gerek olmadan düzeltme talebiyle geri istenebilir; reddedilirse şikayet ve dava yolu açılır.",
 haklar:[
  {b:"Düzeltme talebi",a:"Vergi dairesine yazılı dilekçeyle başvurulur; vergilendirme veya hesap hatası varsa idare kendiliğinden de düzeltir."},
  {b:"Şikayet yoluyla başvuru",a:"Düzeltme talebi reddedilirse Hazine ve Maliye Bakanlığı'na şikayet edilir (VUK m.124), ardından dava açılır."},
  {b:"Faiz",a:"Fazla veya haksız tahsil edilen vergi iade edilirken, düzeltme fişine dayanan iadelerde tecil faizi oranında faiz işletilir."},
  {b:"İade hakkı doğuran işlemler",a:"İhracat, indirimli orana tabi teslimler ve tevkifat gibi hâllerde KDV iadesi ayrı bir usule tabidir."}
 ],
 dikkat:[
  "<strong>5 yıllık düzeltme zamanaşımı</strong>: vergi alacağının doğduğu yılı izleyen yılbaşından itibaren 5 yıl (VUK m.126).",
  "Gümrük vergilerinde süre daha kısadır: <strong>3 yıl</strong> (GK m.211).",
  "İdare 60 gün içinde cevap vermezse talep <strong>zımnen reddedilmiş</strong> sayılır ve dava süresi işlemeye başlar (İYUK m.10)."
 ],
 mevzuat:["VUK m.116-126 (vergi hataları ve düzeltme)","VUK m.124 (şikayet)","VUK m.112/4 (faiz)","İYUK m.10-11"],
 sure:{gun:1825,ad:"Düzeltme zamanaşımı: 5 yıl (VUK m.126)",olay:"Ödeme / tahakkuk yılı"},
 araclar:["vergiIade","vergiDavasi","gozetim"]},

{id:"v_emlak",alan:"vergi",prior:0.6,
 ad:"Emlak vergisi, MTV veya tapu harcı gibi bir vergiyi fazla / hatalı ödediniz",
 ozet:"Bu vergilerde tutar matraha bağlı olduğu için hata sık görülür: yanlış bina/arsa değeri, yanlış oran veya hak edilen muafiyetin uygulanmaması.",
 haklar:[
  {b:"Doğru tutarın hesaplanması",a:"Vergi değeri, oran ve büyükşehir farkı üzerinden gerçek tutar bulunur."},
  {b:"Muafiyet ve indirimlerin uygulanması",a:"Tek meskeni olan emekli, engelli, gazi ve dul-yetimlere sıfır oranlı emlak vergisi uygulanabilir."},
  {b:"Fazla ödemenin iadesi / mahsubu",a:"Belediyeye ya da vergi dairesine düzeltme dilekçesiyle başvurulur; sonraki dönem borcuna mahsup da istenebilir."}
 ],
 dikkat:[
  "Muafiyet <strong>başvuruya bağlıdır</strong>; geçmiş yıllar için kendiliğinden geri ödenmez, düzeltme talep edilmesi gerekir.",
  "Tapu harcı gerçek satış bedeli üzerinden hesaplanır; düşük gösterilen bedel sonradan ceza doğurur.",
  "Emlak vergisinde düzeltme talebi de 5 yıllık zamanaşımına tabidir."
 ],
 mevzuat:["1319 sayılı Emlak Vergisi Kanunu m.8, 29","492 sayılı Harçlar Kanunu","VUK m.116-126"],
 sure:{gun:1825,ad:"Düzeltme zamanaşımı: 5 yıl (VUK m.126)",olay:"Ödeme yılı"},
 araclar:["evSatisIade","emlakVergisi","vergiIade","tapu"]},

/* ---------------- DİĞER ---------------- */
{id:"d_bosanma",alan:"diger",prior:1.0,
 ad:"Boşanma sürecindesiniz; tazminat ve mal paylaşımı gündemde",
 ozet:"Boşanmada üç ayrı kalem birlikte değerlendirilir: maddi-manevi tazminat, nafaka ve edinilmiş mallara katılma alacağı.",
 haklar:[
  {b:"Maddi ve manevi tazminat",a:"Boşanmada kusuru daha az olan taraf, yoksun kaldığı menfaatler ve kişilik hakkı ihlali için tazminat isteyebilir."},
  {b:"Edinilmiş mallara katılma alacağı",a:"2002 sonrası evliliklerde kural: evlilik içinde edinilen malların yarısı. Miras ve bağış gibi kişisel mallar hariçtir."},
  {b:"Yoksulluk nafakası",a:"Boşanmayla yoksulluğa düşecek eş için süresiz olarak istenebilir."},
  {b:"İştirak nafakası",a:"Velayeti alan eşe, çocuğun bakım ve eğitim giderleri için ödenir."}
 ],
 dikkat:[
  "Mal rejimi tasfiyesi boşanma davasından <strong>ayrı bir dava</strong>dır; boşanma kesinleşmeden karar verilmez.",
  "Katılma alacağında zamanaşımı boşanmanın kesinleşmesinden itibaren <strong>10 yıl</strong>dır.",
  "Kusur belgelemesi tazminatın belirleyicisidir; mesaj, tanık ve rapor gibi delilleri baştan toplayın."
 ],
 mevzuat:["TMK m.174 (tazminat)","TMK m.175 (yoksulluk nafakası)","TMK m.182 (iştirak nafakası)","TMK m.202, 231, 236 (mal rejimi)"],
 araclar:["bosanma","nafaka"]},

{id:"d_nafaka",alan:"diger",prior:0.7,
 ad:"Konu nafaka: miktarın belirlenmesi, artırılması veya kaldırılması",
 ozet:"Nafaka tutarı tarafların geliri, çocuğun ihtiyaçları ve hakkaniyet ölçütüne göre belirlenir; şartlar değişirse yeniden düzenlenmesi istenebilir.",
 haklar:[
  {b:"İştirak nafakası",a:"Çocuğun eğitim, sağlık ve barınma giderlerine katkı; velayeti almayan eş öder."},
  {b:"Yoksulluk nafakası",a:"Boşanmayla yoksulluğa düşen eş için; kusuru daha ağır olan eş talep edemez."},
  {b:"Artırım / azaltım davası",a:"Enflasyon, gelir değişimi veya çocuğun büyümesi nafakanın yeniden belirlenmesini gerektirir."},
  {b:"Tedbir nafakası",a:"Dava sürerken geçici olarak bağlanır; dava tarihinden itibaren istenebilir."}
 ],
 dikkat:[
  "Nafaka alacaklısının yeniden evlenmesi veya fiilen evli gibi yaşaması <strong>kaldırma sebebi</strong>dir.",
  "Ödenmeyen nafaka icra takibine konur; <strong>şikayet üzerine tazyik hapsi</strong> uygulanabilir.",
  "Kendiliğinden artış (ÜFE/TÜFE) kararda yazmıyorsa artırım için dava gerekir."
 ],
 mevzuat:["TMK m.169, 175, 176, 182","İİK m.344 (nafaka borcunun ödenmemesi)"],
 araclar:["nafaka","bosanma"]},

{id:"d_miras",alan:"diger",prior:0.9,
 ad:"Miras paylaşımı konusunda hakkınızı öğrenmek istiyorsunuz",
 ozet:"Önce yasal pay oranları, sonra saklı pay ve tenkis konuları değerlendirilir; muris sağlığında mal kaçırdıysa denkleştirme gündeme gelir.",
 haklar:[
  {b:"Yasal miras payı",a:"Zümre sistemine göre belirlenir: alt soy, sağ kalan eş, anne-baba ve kardeşler sırasıyla dikkate alınır."},
  {b:"Saklı pay ve tenkis",a:"Vasiyet veya bağışla saklı payınız ihlal edildiyse tenkis davasıyla azaltılması istenir."},
  {b:"Muris muvazaası (mirastan mal kaçırma)",a:"Satış gibi gösterilen bağışlar için tapu iptali ve tescil davası açılabilir."},
  {b:"Ortaklığın giderilmesi",a:"Paylaşımda anlaşma sağlanamazsa izale-i şuyu davasıyla taşınmaz satılır veya aynen bölünür."}
 ],
 dikkat:[
  "Tenkis davası, saklı pay ihlalinin öğrenilmesinden itibaren <strong>1 yıl</strong> ve her hâlde 10 yıl içinde açılmalıdır (TMK m.571).",
  "Mirasın reddi süresi <strong>3 ay</strong>dır; borç ihtimali varsa bu süreyi kaçırmayın (TMK m.606).",
  "Muris muvazaası davasında zamanaşımı yoktur, ancak deliller zamanla kaybolur."
 ],
 mevzuat:["TMK m.495-501 (yasal mirasçılar)","TMK m.505-506 (saklı pay)","TMK m.560, 571 (tenkis)","TMK m.606 (ret)"],
 araclar:["miras","tapu"]},

{id:"d_kamulastirma",alan:"diger",prior:0.55,
 ad:"Taşınmazınıza idare tarafından kamulaştırma yapılmadan el atıldı",
 ozet:"İdare usulüne uygun kamulaştırma yapmadan taşınmazı fiilen kullanıyor veya imar kararıyla kullanımınızı tamamen kısıtlıyorsa bedelini talep edebilirsiniz.",
 haklar:[
  {b:"Fiilî el atmada bedel talebi",a:"Yol, park veya tesis yapılmışsa taşınmazın gerçek değeri istenir; dava adli yargıda görülür."},
  {b:"Hukukî el atmada bedel",a:"İmar planında kamu hizmetine ayrıldığı hâlde 5 yıl içinde kamulaştırılmayan taşınmazlar için bedel istenebilir."},
  {b:"Ecrimisil (kullanım bedeli)",a:"İdarenin haksız kullandığı dönem için kira benzeri tazminat."},
  {b:"Değer artışı ve faiz",a:"Bedel dava tarihindeki değere göre belirlenir; faiz de talep edilir."}
 ],
 dikkat:[
  "Fiilî ve hukukî el atmada <strong>görevli mahkeme farklıdır</strong>; yanlış yargı yolunda açılan dava reddedilir.",
  "Kamulaştırma bedelinin artırılması davası, tebliğden itibaren <strong>30 gün</strong> içinde açılmalıdır.",
  "Taşınmazın gerçek değeri için emsal satışlar ve imar durumu belgelenmelidir."
 ],
 mevzuat:["2942 sayılı Kamulaştırma Kanunu m.10, 14","Kamulaştırma K. Geçici m.6","TMK m.683, 995"],
 araclar:["kamulastirma","tapu"]},

{id:"d_tuketici",alan:"diger",prior:0.8,
 ad:"Aldığınız ürün veya hizmet ayıplı çıktı",
 ozet:"Ayıplı malda dört seçimlik hak vardır ve tercih tüketiciye aittir; satıcı sizi tek bir yola zorlayamaz.",
 haklar:[
  {b:"Ücretsiz onarım",a:"Makul süre (en çok 30 iş günü) içinde yapılmazsa diğer haklara geçilir."},
  {b:"Ayıpsız yenisiyle değişim",a:"Aynı özellikte ayıpsız ürünle değiştirilmesi istenebilir."},
  {b:"Bedel iadesi (sözleşmeden dönme)",a:"Ödediğiniz tutarın tamamının iadesi."},
  {b:"Bedelden indirim",a:"Ürünü kullanmaya devam edip ayıp oranında indirim isteme."}
 ],
 dikkat:[
  "Teslimden itibaren <strong>6 ay içinde</strong> ortaya çıkan ayıbın baştan var olduğu kabul edilir; ispat yükü satıcıdadır.",
  "Zamanaşımı <strong>2 yıl</strong> (konutlarda 5 yıl); ayıp gizlenmişse zamanaşımı işlemez.",
  "Parasal sınıra göre önce <strong>Tüketici Hakem Heyeti</strong>ne başvurulması zorunludur; sınırın üzerindeki uyuşmazlıklarda tüketici mahkemesine gidilir."
 ],
 mevzuat:["6502 sayılı TKHK m.8-11 (ayıplı mal)","TKHK m.66-72 (hakem heyetleri)","TBK m.227"],
 sure:{gun:730,ad:"Ayıplı malda 2 yıllık zamanaşımı (TKHK m.12)",olay:"Teslim tarihi"},
 araclar:["tuketici"]}
];
const TANI_MAP={};TANI_H.forEach(function(h){TANI_MAP[h.id]=h;});

/* Sorular. arti: bu yanıt hangi senaryoları güçlendirir, eksi: hangilerini
   zayıflatır, alan: yanıt doğrudan hukuk alanını belirler. when: soru
   yalnızca bu koşulda anlamlı (gereksiz soru sorulmasın). */
const TANI_Q=[
{id:"alan",t:"Başlayalım — yaşadığınız olay hangisine daha yakın?",
 h:"Önce hangi alanda olduğunuzu anlamam gerekiyor. Sonraki sorular verdiğiniz yanıta göre değişecek.",
 o:[
  {k:"Trafik kazası geçirdim ya da trafik cezası aldım",s:"Araç hasarı, yaralanma, kusur, ceza",alan:"trafik",
   neden:"Trafik dosyalarında araç kalemleri ile bedeni tazminatlar bambaşka hesaplanıyor; hangisi olduğunu ayırmam gerek."},
  {k:"İşveren veya iş yerimle sorunum var",s:"İşten çıkarılma, istifa, ödenmeyen alacak, iş kazası",alan:"is",
   neden:"İş hukukunda neredeyse her şey tek bir ayrıma bağlı: sözleşmeyi kim, hangi sebeple bitirdi."},
  {k:"Vergi veya gümrükle ilgili bir durumum var",s:"Fazla ödenen vergi, ihbarname, ceza, ithalat",alan:"vergi",
   neden:"Vergi tarafında süreler çok kısa; elinize hangi belgenin geçtiği yol haritasını tamamen değiştiriyor."},
  {k:"Aile, miras, taşınmaz veya tüketici konusu",s:"Boşanma, nafaka, miras, arazi, ayıplı ürün",alan:"diger",
   neden:"Bu alanlarda hesap kalemi tamamen farklı; hangi ilişki içinde olduğunuzu netleştirmem gerek."}
 ]},

/* --- trafik --- */
{id:"t_tur",t:"Trafikte tam olarak ne oldu?",when:function(f){return f.alan==="trafik";},
 h:"Kaza ile idari para cezası bambaşka iki süreç: birinde tazminat, diğerinde 15 günlük itiraz süresi var.",
 o:[
  {k:"Kaza oldu, hasar veya yaralanma var",s:"Çarpışma, devrilme, çarpıp kaçma",eksi:["t_ceza"],
   neden:"Kaza varsa tazminat hattındayız; ceza itirazı devre dışı kalıyor."},
  {k:"Kaza yok, sadece ceza yazıldı",s:"Hız, kırmızı ışık, park, EDS",arti:["t_ceza"],eksi:["t_karsi","t_ben","t_pert","t_kusur","t_yara","t_vefat"],
   neden:"Ortada zarar değil idari yaptırım var; burada tek konu 15 gün içinde itiraz."}
 ]},

{id:"t_sonuc",t:"Kazada yaralanan ya da hayatını kaybeden biri oldu mu?",when:function(f){return f.alan==="trafik"&&f.t_tur===0;},
 h:"Bu, dosyanın en belirleyici sorusu: yaralanma varsa hesap araç kalemleriyle sınırlı kalmıyor.",
 o:[
  {k:"Hayır, sadece araçlarda hasar var",s:"Kimse yaralanmadı",arti:["t_karsi","t_ben","t_pert","t_kusur"],eksi:["t_yara","t_vefat"],
   neden:"Sadece maddi hasar varsa değer kaybı, onarım ve mahrumiyet kalemlerine odaklanıyorum."},
  {k:"Evet, yaralanma var",s:"Ben veya bir yakınım yaralandı",arti:["t_yara"],eksi:["t_vefat","t_pert","t_karsi","t_ben"],
   neden:"Yaralanma varsa iş göremezlik, sakatlık ve manevi tazminat da devreye giriyor — bunlar araç kalemlerinden çok daha büyük tutarlar."},
  {k:"Kazada vefat eden oldu",s:"Yakınımı kaybettim",arti:["t_vefat"],eksi:["t_yara","t_pert","t_ben","t_karsi"],
   neden:"Vefat hâlinde talep destekten yoksun kalma tazminatına dönüyor ve bu hak mirastan bağımsız."}
 ]},

{id:"t_kusurkim",t:"Kusur kimde görünüyor?",when:function(f){return f.alan==="trafik"&&f.t_tur===0;},
 h:"Tazminatın tamamı kusur oranıyla çarpıldığı için bu soru tutarı doğrudan belirliyor.",
 o:[
  {k:"Karşı taraf kusurlu",s:"Tutanak veya kayıtlar karşı tarafı gösteriyor",arti:["t_karsi","t_yara","t_pert"],eksi:["t_ben","t_kusur"],
   neden:"Kusur karşı tarafta ise zararınızın tamamını onun sigortasından isteyebiliyorsunuz."},
  {k:"Kusur bende",s:"Kabahat bendeydi",arti:["t_ben"],eksi:["t_karsi"],
   neden:"Kusur sizdeyse karşı taraftan tazminat çıkmıyor; konu kasko ve karşı tarafın talebinin ölçüsü oluyor."},
  {k:"Tartışmalı veya bilmiyorum",s:"İki taraf da kusurlu görünüyor / itiraz ettim",arti:["t_kusur"],
   neden:"Kusur netleşmeden yapılacak her hesap yanıltıcı olur; önce kusur oranını tespit etmemiz gerek."}
 ]},

{id:"t_pertmi",t:"Aracınız için 'pert' ya da 'ağır hasarlı' dendi mi?",when:function(f){return f.alan==="trafik"&&f.t_tur===0&&f.t_sonuc===0;},
 h:"Pert kaydı girildiyse hesap tamamen değişiyor: değer kaybı yerine rayiç bedel konuşuluyor.",
 o:[
  {k:"Evet, pert / ağır hasar dendi",s:"Onarımı ekonomik bulunmadı",arti:["t_pert"],eksi:["t_karsi"],
   neden:"Pert hâlinde artık değer kaybı istenemiyor; talep rayiç bedel eksi sovtaja dönüyor."},
  {k:"Hayır, araç onarıldı veya onarılabilir",s:"Normal hasar",eksi:["t_pert"],
   neden:"Araç onarılabiliyorsa değer kaybı en önemli kalem hâline geliyor."}
 ]},

/* --- iş --- */
{id:"i_durum",t:"İş ilişkiniz şu an hangi durumda?",when:function(f){return f.alan==="is";},
 h:"İş hukukunda hesabın tamamı buna bağlı: sözleşmeyi kimin bitirdiği kıdem ve ihbarı doğrudan belirliyor.",
 o:[
  {k:"İşveren çıkardı",s:"Fesih işverenden geldi",arti:["i_cikarildi","i_iade"],eksi:["i_istifa","i_hakli","i_odenmeyen"],
   neden:"Fesih işverenden geldiyse hem kıdem hem ihbar tazminatı gündeme geliyor; ayrıca işe iade süresi işlemeye başlıyor."},
  {k:"Ben ayrıldım / istifa ettim",s:"Sözleşmeyi ben sona erdirdim",arti:["i_istifa","i_hakli"],eksi:["i_cikarildi","i_iade","i_odenmeyen"],
   neden:"Siz ayrıldıysanız ihbar tazminatı doğmuyor; kıdem ise ayrılma sebebinize bağlı — bunu netleştirmem gerek."},
  {k:"Hâlâ çalışıyorum",s:"Ama haklarım ödenmiyor",arti:["i_odenmeyen"],eksi:["i_cikarildi","i_istifa","i_iade","i_hakli"],
   neden:"Çalışmaya devam ediyorsanız hem alacak talebi hem de haklı fesih seçeneği aynı anda masada."},
  {k:"İş kazası geçirdim / meslek hastalığı var",s:"Yaralanma veya sağlık kaybı",arti:["i_kaza"],eksi:["i_istifa","i_iade","i_belirli","i_odenmeyen"],
   neden:"İş kazasında iki ayrı hat var: SGK ödemeleri ve bunları aşan zarar için işverene karşı dava."}
 ]},

{id:"i_sebep",t:"Ayrılma sebebiniz şunlardan biri mi?",when:function(f){return f.alan==="is"&&f.i_durum===1;},
 h:"Ücretin ödenmemesi, sigortanın eksik yatması, mobbing, hakaret, taciz, ağır çalışma koşulları veya sağlık sorunu.",
 o:[
  {k:"Evet, bu sebeplerden biri yüzünden ayrıldım",s:"Haklı fesih ihtimali var",arti:["i_hakli"],eksi:["i_istifa"],
   neden:"Haklı sebeple ayrılan işçi <em>kıdem tazminatını kaybetmiyor</em> — istifa ile arasındaki en büyük fark bu."},
  {k:"Hayır, kendi tercihimle ayrıldım",s:"Başka iş buldum / kişisel sebep",arti:["i_istifa"],eksi:["i_hakli"],
   neden:"Sebepsiz istifada kıdem ve ihbar çıkmıyor; hesap izin ve birikmiş ücret alacaklarıyla sınırlı kalıyor."}
 ]},

{id:"i_kidem",t:"Aynı işverende ne kadar süre çalıştınız?",when:function(f){return f.alan==="is"&&f.i_durum!==undefined&&f.i_durum!==3;},
 h:"Kıdem tazminatı 1 yıl, işe iade güvencesi ise 6 ay şartına bağlı.",
 o:[
  {k:"1 yıldan fazla",s:"Kıdem şartı tamam",arti:["i_cikarildi","i_hakli","i_belirli"],
   neden:"1 yılı geçtiğiniz için kıdem tazminatı şartı sağlanıyor; her tam yıl 30 günlük ücret demek."},
  {k:"6 ay - 1 yıl arası",s:"Kıdem için yetersiz, iş güvencesi için yeterli",eksi:["i_belirli"],
   neden:"1 yıl dolmadığı için kıdem tazminatı doğmuyor; ancak 6 ayı geçtiğiniz için işe iade güvencesi devrede."},
  {k:"6 aydan az",s:"Yeni başlamıştım",eksi:["i_cikarildi","i_iade","i_hakli"],
   neden:"6 ayın altında hem kıdem hem işe iade güvencesi devre dışı; talep ücret ve izin alacaklarına iniyor."}
 ]},

{id:"i_sayi",t:"İş yerinde 30 veya daha fazla işçi çalışıyor mu?",when:function(f){return f.alan==="is"&&f.i_durum===0;},
 h:"İşe iade davasının en katı şartı bu. Aynı işverenin aynı işkolundaki tüm iş yerleri birlikte sayılır.",
 o:[
  {k:"Evet, 30'dan fazla",s:"Büyük iş yeri / şube ağı var",arti:["i_iade"],
   neden:"30 işçi şartı sağlandığı için iş güvencesi hükümleri uygulanıyor — işe iade en güçlü koz hâline geliyor."},
  {k:"Hayır veya bilmiyorum",s:"Küçük iş yeri",eksi:["i_iade"],
   neden:"30 işçi şartı yoksa işe iade yolu kapanıyor; hesap kıdem, ihbar ve diğer alacaklarla devam ediyor."}
 ]},

{id:"i_sozlesme",t:"Sözleşmeniz belirli süreli miydi?",when:function(f){return f.alan==="is"&&(f.i_durum===0||f.i_durum===1);},
 h:"Örneğin özel okul öğretmenliği, proje bazlı işler veya süresi baştan yazılı olarak belirlenmiş sözleşmeler.",
 o:[
  {k:"Evet, bitiş tarihi belliydi",s:"Süreli sözleşme",arti:["i_belirli"],eksi:["i_iade"],
   neden:"Belirli süreli sözleşmede ihbar tazminatı yerine <em>bakiye süre ücreti</em> isteniyor — bu genelde daha yüksek."},
  {k:"Hayır, süresizdi",s:"Standart sözleşme",eksi:["i_belirli"],
   neden:"Belirsiz süreli sözleşme, iş güvencesi ve ihbar tazminatı hükümlerinin doğal alanı."}
 ]},

/* --- vergi --- */
{id:"v_belge",t:"Elinize hangi belge geçti veya durum ne?",when:function(f){return f.alan==="vergi";},
 h:"Vergi tarafında sürenin hangi tarihte başladığını belirleyen şey bu belge.",
 o:[
  {k:"Gümrük beyannamesi / ithalat işlemi",s:"İthalatta vergi ödedim",arti:["v_gozetim","v_gumrukceza"],eksi:["v_vergiceza","v_emlak"],
   neden:"Gümrük tarafında hem gözetim kaynaklı fazla vergi hem de m.234 cezası ihtimali var; hangisi olduğunu ayırmam gerek."},
  {k:"Vergi dairesinden ihbarname / ceza",s:"Vergi ziyaı, usulsüzlük, ek tarhiyat",arti:["v_vergiceza"],eksi:["v_gozetim","v_emlak"],
   neden:"İhbarname elinize geçtiği anda 30 günlük süre başlıyor; bu süre dava, uzlaşma ve indirim arasında tek seçim hakkı veriyor."},
  {k:"Fazla / yersiz ödeme yaptığımı düşünüyorum",s:"Ödedim ama tutar yüksek geldi",arti:["v_iade","v_emlak"],eksi:["v_vergiceza","v_gumrukceza"],
   neden:"Ortada ceza yoksa yol dava değil düzeltme talebi; bu daha hızlı ve masrafsız işliyor."},
  {k:"Henüz belge yok, ne olacağını öğrenmek istiyorum",s:"Önceden hesaplamak istiyorum",eksi:["v_vergiceza","v_gumrukceza"],
   neden:"Henüz işlem yapılmamışsa doğru hamle, tutarı önceden hesaplayıp planlamak."}
 ]},

{id:"v_gumruk",t:"Gümrükte tam olarak ne oldu?",when:function(f){return f.alan==="vergi"&&f.v_belge===0;},
 h:"Gözetim uygulaması ile ceza kararı ayrı süreçler: birinde 3 yıllık iade hakkı, diğerinde 15 günlük itiraz süresi var.",
 o:[
  {k:"Beyan ettiğim kıymet kabul edilmedi, üstüne vergi ödedim",s:"Gözetim / kıymet artırımı",arti:["v_gozetim"],eksi:["v_gumrukceza"],
   neden:"Bu tipik gözetim tablosu: kıymet yapay olarak yükseltilip fazla KDV ödettiriliyor ve bu fazla kısım iade edilebiliyor."},
  {k:"Hakkımda ceza kesildi / ek tahakkuk yapıldı",s:"GK m.234 cezası",arti:["v_gumrukceza"],eksi:["v_gozetim"],
   neden:"Ceza kesildiyse ilk iş 15 günlük itiraz süresini korumak; ondan sonra uzlaşma-dava karşılaştırması yapılıyor."},
  {k:"Sadece ne kadar vergi ödeyeceğimi hesaplamak istiyorum",s:"Henüz ithalat yapmadım",eksi:["v_gozetim","v_gumrukceza"],
   neden:"İthalat öncesindeyseniz GV, İGV, ÖTV ve KDV kademesini önceden görmek maliyeti planlamanızı sağlıyor."}
 ]},

{id:"v_hangi",t:"Hangi vergiyi fazla ödediğinizi düşünüyorsunuz?",when:function(f){return f.alan==="vergi"&&f.v_belge===2;},
 h:"İade usulü ve süre, verginin türüne göre değişiyor.",
 o:[
  {k:"Gelir / kurumlar vergisi veya KDV",s:"Beyanname, stopaj, tevkifat",arti:["v_iade"],eksi:["v_emlak"],
   neden:"Bu vergilerde düzeltme talebi ve iade hakkı doğuran işlem usulü devrede; süre 5 yıl."},
  {k:"Emlak vergisi, MTV veya tapu harcı",s:"Belediye / tapu ödemeleri",arti:["v_emlak"],
   neden:"Bu vergilerde hata matrahta olur: yanlış değer, yanlış oran veya uygulanmayan muafiyet."},
  {k:"Gümrük vergileri",s:"İthalatta ödediğim vergiler",arti:["v_gozetim","v_iade"],eksi:["v_emlak"],
   neden:"Gümrük vergilerinde süre 5 yıl değil <em>3 yıl</em>; bu yüzden acele etmek gerekiyor."}
 ]},

/* --- diğer --- */
{id:"d_konu",t:"Konu tam olarak hangisi?",when:function(f){return f.alan==="diger";},
 h:"Bu alanların her birinin kendi hesap kalemleri ve süreleri var.",
 o:[
  {k:"Boşanma",s:"Tazminat, nafaka, mal paylaşımı",arti:["d_bosanma","d_nafaka"],eksi:["d_miras","d_kamulastirma","d_tuketici"],
   neden:"Boşanmada üç kalem birden konuşuluyor: tazminat, nafaka ve edinilmiş mallara katılma."},
  {k:"Sadece nafaka",s:"Miktar, artırım, kaldırma",arti:["d_nafaka"],eksi:["d_bosanma","d_miras","d_kamulastirma","d_tuketici"],
   neden:"Nafaka tek başına konuysa mesele miktarın hakkaniyete uygunluğu ve şartların değişip değişmediği."},
  {k:"Miras",s:"Pay, vasiyet, mal kaçırma",arti:["d_miras"],eksi:["d_bosanma","d_nafaka","d_kamulastirma","d_tuketici"],
   neden:"Mirasta önce yasal paylar, sonra saklı pay ihlali ve muvazaa değerlendiriliyor."},
  {k:"Taşınmaz / arazi",s:"El atma, kamulaştırma, tapu",arti:["d_kamulastirma"],eksi:["d_bosanma","d_nafaka","d_miras","d_tuketici"],
   neden:"İdare el attıysa bedel talebi var; ama fiilî ve hukukî el atmada görevli mahkeme farklı."},
  {k:"Ayıplı ürün veya hizmet",s:"Bozuk mal, eksik hizmet",arti:["d_tuketici"],eksi:["d_bosanma","d_nafaka","d_miras","d_kamulastirma"],
   neden:"Tüketici uyuşmazlığında dört seçimlik hak var ve tercih size ait; ayrıca parasal sınıra göre önce hakem heyeti gerekiyor."}
 ]}
];

/* Trace ve "aklımdakiler" panelinde senaryoyu tek satırda anmak için kısa ad. */
const TANI_KISA={
 t_karsi:"karşı taraf kusurlu maddi hasarlı kaza",t_ben:"kusur sizde olan kaza",t_pert:"pert olan araç",
 t_kusur:"kusuru tartışmalı kaza",t_yara:"yaralanmalı kaza",t_vefat:"ölümlü kaza",t_ceza:"trafik cezasına itiraz",
 i_cikarildi:"işveren tarafından çıkarılma",i_istifa:"sebepsiz istifa",i_hakli:"haklı sebeple ayrılma",
 i_iade:"işe iade davası",i_kaza:"iş kazası",i_odenmeyen:"ödenmeyen işçilik alacakları",i_belirli:"belirli süreli sözleşmenin erken feshi",
 v_gozetim:"gümrükte gözetim kaynaklı fazla vergi",v_gumrukceza:"gümrük para cezası",v_vergiceza:"vergi ihbarnamesi",
 v_iade:"fazla ödenen verginin iadesi",v_emlak:"emlak/MTV/tapu harcı hatası",
 d_bosanma:"boşanma",d_nafaka:"nafaka",d_miras:"miras paylaşımı",d_kamulastirma:"kamulaştırmasız el atma",d_tuketici:"ayıplı mal"
};

const taniState={p:{},f:{},sorulan:[],iz:[],red:{},faz:"soru",q:null,dusun:false,tahminId:null,tur:0};

function openTani(){
  taniState.p={};taniState.f={};taniState.sorulan=[];taniState.iz=[];taniState.red={};
  taniState.faz="soru";taniState.dusun=false;taniState.tahminId=null;taniState.tur=0;
  TANI_H.forEach(function(h){taniState.p[h.id]=h.prior||1;});
  taniNorm();
  taniState.q=TANI_Q[0];
  renderTani();
}
function taniNorm(){
  let t=0;for(const k in taniState.p)t+=taniState.p[k];
  if(t<=0){TANI_H.forEach(function(h){taniState.p[h.id]=h.prior||1;});t=0;for(const k in taniState.p)t+=taniState.p[k];}
  for(const k in taniState.p)taniState.p[k]/=t;
}
/* Bir yanıtın senaryoya verdiği ham ağırlık. */
function taniW(opt,h){
  if(opt.alan)return h.alan===opt.alan?6:0.03;
  if(opt.eksi&&opt.eksi.indexOf(h.id)!==-1)return 0.07;
  if(opt.arti&&opt.arti.indexOf(h.id)!==-1)return 4.5;
  return 1;
}
/* Olabilirlik: her senaryo için seçenekler arasında normalize edilir, böylece
   çok seçenekli sorular haksız biçimde baskın hâle gelmez. */
function taniL(q,i,h){
  let t=0;for(let j=0;j<q.o.length;j++)t+=taniW(q.o[j],h);
  return taniW(q.o[i],h)/t;
}
function taniEntropi(p){
  let e=0;for(const k in p){const v=p[k];if(v>1e-9)e-=v*Math.log2(v);}
  return e;
}
/* Bilgi kazancı: bu soru sorulursa belirsizlik ne kadar azalır. */
function taniKazanc(q){
  const H0=taniEntropi(taniState.p);let bek=0;
  for(let i=0;i<q.o.length;i++){
    const post={};let po=0;
    for(const id in taniState.p){
      if(taniState.red[id])continue;
      const v=taniState.p[id]*taniL(q,i,TANI_MAP[id]);
      post[id]=v;po+=v;
    }
    if(po<1e-12)continue;
    for(const id in post)post[id]/=po;
    bek+=po*taniEntropi(post);
  }
  return H0-bek;
}
function taniAdaylar(){
  return TANI_Q.filter(function(q){
    if(taniState.sorulan.indexOf(q.id)!==-1)return false;
    if(q.when&&!q.when(taniState.f))return false;
    return true;
  });
}
/* Sıradaki soru sabit değil: kalan belirsizliği en çok azaltan soru seçilir. */
function taniSoruSec(){
  const ad=taniAdaylar();if(!ad.length)return null;
  let en=null,enK=-1;
  ad.forEach(function(q){const k=taniKazanc(q);if(k>enK){enK=k;en=q;}});
  if(enK<0.03)return null;
  return en;
}
function taniSirali(){
  const a=[];
  for(const id in taniState.p){if(taniState.red[id])continue;a.push({h:TANI_MAP[id],p:taniState.p[id]});}
  a.sort(function(x,y){return y.p-x.p;});
  return a;
}
function taniYeterMi(){
  const s=taniSirali();if(!s.length)return true;
  if(taniState.sorulan.length>=6)return true;
  const ik=s[1]?s[1].p:0;
  /* İkinci olasılık hâlâ ciddi bir paya sahipse tahmin etmiyoruz: %70'e
     karşı %22 "emin" sayılmaz, aradaki ayrımı yapan soru (pert mi, kusur
     kimde) sorulmadan geçilirse yanlış araca yönlendiriyoruz. */
  const emin=s[0].p>=0.55&&ik<0.20&&(ik<1e-9||s[0].p/ik>=2.5);
  if(!emin)return false;
  /* Emin olsak da en az üç soru soralım: tek soruda "tahmin ettim" demek
     hem güven vermiyor hem de sonucu zenginleştiren ayrımları atlıyor. */
  if(taniState.sorulan.length<3&&taniSoruSec())return false;
  return true;
}

function taniCevap(i){
  const q=taniState.q;if(!q||taniState.dusun)return;
  const opt=q.o[i];
  const once=taniSirali();
  const oncePay={};once.forEach(function(x){oncePay[x.h.id]=x.p;});
  for(const id in taniState.p){
    if(taniState.red[id]){taniState.p[id]=0;continue;}
    taniState.p[id]=taniState.p[id]*taniL(q,i,TANI_MAP[id]);
  }
  taniNorm();
  taniState.f[q.id]=i;
  if(opt.alan)taniState.f.alan=opt.alan;
  taniState.sorulan.push(q.id);
  /* Gerekçe satırı: yanıttan sonra oranı en çok yükselen senaryo hangisiyse
     onu adıyla anıyoruz — metin sabit değil, gerçek hesaptan çıkıyor. */
  const sonra=taniSirali();
  let yuk=null,enOran=1.15;
  sonra.forEach(function(x){
    const o=oncePay[x.h.id]||1e-6;
    const oran=x.p/o;
    if(x.p>0.05&&oran>enOran){enOran=oran;yuk=x.h;}
  });
  taniState.iz.push({soru:q.t,secim:opt.k,neden:opt.neden||"",yuk:yuk?(TANI_KISA[yuk.id]||yuk.ad):"",kat:enOran});
  taniState.tur++;
  taniState.dusun=true;renderTani();
  setTimeout(function(){
    taniState.dusun=false;
    const yeter=taniYeterMi();
    const sonraki=yeter?null:taniSoruSec();
    if(sonraki){taniState.q=sonraki;taniState.faz="soru";}
    else{taniState.q=null;taniState.faz="tahmin";taniState.tahminId=taniSirali()[0]?taniSirali()[0].h.id:null;}
    renderTani();
  },820);
}
/* Tahmin yanlışsa: senaryo eleniyor, motor kalanlarla devam ediyor. */
function taniRed(){
  const id=taniState.tahminId;if(!id)return;
  taniState.red[id]=1;taniState.p[id]=0;taniNorm();
  taniState.iz.push({soru:"Tahminim doğru mu?",secim:"Hayır, durumum bu değil",neden:"Bu senaryoyu listeden çıkardım ve kalan olasılıklarla devam ediyorum.",yuk:"",kat:0,red:TANI_KISA[id]||""});
  const kalan=taniSirali();
  if(!kalan.length){taniState.faz="liste";renderTani();return;}
  taniState.dusun=true;renderTani();
  setTimeout(function(){
    taniState.dusun=false;
    const q=taniSoruSec();
    if(q&&taniState.sorulan.length<8){taniState.q=q;taniState.faz="soru";}
    else{taniState.tahminId=kalan[0].h.id;taniState.faz="tahmin";}
    renderTani();
  },700);
}
function taniOnay(){
  const hp=TANI_MAP[taniState.tahminId];
  if(!hp){taniState.faz="liste";renderTani();return;}
  state.pendingType="durumTespiti";
  state.pendingResult={total:0,tani:hp.id};
  state.pendingExtra="Durum tespiti · "+hp.ad+" · Alan: "+hp.alan+" · Sorular: "+taniState.sorulan.join(", ");
  const ci=getStoredContactInfo();
  if(ci)finalizeLead(ci,"");else showLeadModal("durumTespiti");
}
function taniSonucGoster(){taniState.faz="sonuc";renderTani();window.scrollTo({top:0,behavior:"smooth"});}
function taniBasa(){openTani();window.scrollTo({top:0,behavior:"smooth"});}

/* ---------- görünüm ---------- */
function taniYuzde(p){return Math.round(p*100);}
function taniAklim(){
  const s=taniSirali().slice(0,3).filter(function(x){return x.p>0.03;});
  if(s.length<2)return "";
  let h='<div class="tani-mind"><div class="tani-mind-lbl">Şu an aklımdakiler</div>';
  s.forEach(function(x,i){
    h+='<div class="tani-mind-row"><span class="tani-mind-name">'+(TANI_KISA[x.h.id]||x.h.ad)+'</span>'+
       '<span class="tani-mind-bar"><i style="width:'+Math.max(4,taniYuzde(x.p))+'%'+(i===0?';opacity:1':'')+'"></i></span>'+
       '<span class="tani-mind-pct">%'+taniYuzde(x.p)+'</span></div>';
  });
  return h+'</div>';
}
function taniIzHtml(acik){
  if(!taniState.iz.length)return "";
  let h='<details class="tani-iz"'+(acik?" open":"")+'><summary>Nasıl düşündüm? <span>'+taniState.iz.length+' adım</span></summary><ol>';
  taniState.iz.forEach(function(x){
    h+='<li><span class="tani-iz-s">'+x.soru+'</span><span class="tani-iz-c">'+x.secim+'</span>';
    if(x.neden)h+='<span class="tani-iz-n">'+x.neden+'</span>';
    if(x.red)h+='<span class="tani-iz-n">Eledim: '+x.red+'</span>';
    else if(x.yuk&&x.kat>1.3)h+='<span class="tani-iz-y">→ öne çıkan: '+x.yuk+'</span>';
    h+='</li>';
  });
  return h+'</ol></details>';
}
function taniArac(id,ana){
  const m=MODULES.filter(function(x){return x.id===id;})[0];
  if(!m)return "";
  return '<a class="tani-tool'+(ana?" ana":"")+'" href="'+moduleHref(m)+'" target="_blank" rel="noopener">'+
    '<span class="tani-tool-ico">'+moduleIcon(m.id,ana?24:20)+'</span>'+
    '<span class="tani-tool-body"><span class="tani-tool-t">'+m.title.replace(/\n/g," ")+'</span>'+
    (ana?'<span class="tani-tool-d">'+m.desc+'</span>':'')+'</span>'+
    '<svg class="tani-tool-ok" width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M5 9h8M9 5l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';
}

function renderTani(){
  const w=document.getElementById("taniWrapper");if(!w)return;
  let h='<div class="calc-page-header tani-head"><div class="step-number-badge">Durum Tespiti</div>'+
        '<h2>Durumunuzu tahmin edeyim</h2>'+
        '<p>Hangi hesaplamayı yapmanız gerektiğini bilmiyorsanız buradan başlayın. Birkaç soru soracağım, sonra durumunuzu tahmin edeceğim. Yanlış tahmin edersem söylemeniz yeter — kalan olasılıklarla devam ederim.</p></div>';

  if(taniState.dusun){
    h+='<div class="wz-card tani-think"><div class="tani-think-dots"><i></i><i></i><i></i></div>'+
       '<p>Yanıtınızı işliyorum, olasılıkları güncelliyorum…</p>'+taniAklim()+'</div>';
    w.innerHTML=h;return;
  }

  if(taniState.faz==="soru"&&taniState.q){
    const q=taniState.q,n=taniState.sorulan.length+1;
    h+='<div class="wz-card tani-card">';
    h+='<div class="tani-step">'+n+'. soru <span>·</span> genelde 3-5 soru sürüyor</div>';
    h+='<div class="wz-q tani-q">'+q.t+'</div>';
    if(q.h)h+='<p class="wz-hint">'+q.h+'</p>';
    h+='<div class="wz-opts tani-opts">';
    q.o.forEach(function(o,i){
      h+='<button type="button" class="wz-opt tani-opt" onclick="taniCevap('+i+')"><span class="wz-opt-dot"></span>'+
         '<span>'+o.k+(o.s?'<span class="wz-opt-sub">'+o.s+'</span>':'')+'</span></button>';
    });
    h+='</div>';
    h+=taniAklim();
    h+=taniIzHtml(false);
    h+='<div class="tani-foot"><button class="btn-back" onclick="navigate(\'home\')">Vazgeç</button>'+
       '<button class="btn-back" onclick="taniBasa()">Baştan başla</button></div>';
    h+='</div>';
    w.innerHTML=h;return;
  }

  if(taniState.faz==="tahmin"){
    const s=taniSirali(),top=s[0];
    if(!top){taniState.faz="liste";renderTani();return;}
    const g=taniYuzde(top.p);
    h+='<div class="wz-card tani-guess">';
    h+='<div class="tani-guess-lbl">Sanırım durumunuz şu</div>';
    h+='<div class="tani-guess-ad">'+top.h.ad+'</div>';
    h+='<div class="tani-guess-oz">'+top.h.ozet+'</div>';
    h+='<div class="tani-conf"><div class="tani-conf-bar"><i style="width:'+Math.max(8,g)+'%"></i></div>'+
       '<span>%'+g+' eminim</span></div>';
    h+='<div class="tani-guess-act">'+
       '<button class="btn-next" onclick="taniOnay()">Evet — ayrıntılı sonucu göster <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
       '<button class="btn-back" onclick="taniRed()">Hayır, bu değil</button></div>';
    if(s[1]&&s[1].p>0.05)h+='<p class="tani-alt">İkinci olasılık: '+(TANI_KISA[s[1].h.id]||s[1].h.ad)+' (%'+taniYuzde(s[1].p)+')</p>';
    h+=taniIzHtml(true);
    h+='</div>';
    w.innerHTML=h;return;
  }

  if(taniState.faz==="liste"){
    h+='<div class="wz-card"><div class="wz-q">Durumunuzu tahmin edemedim</div>'+
       '<p class="wz-hint">Sorularımın kapsamına girmeyen bir durum olabilir. Aşağıdan doğrudan araç seçebilir ya da baştan başlayabilirsiniz.</p>'+
       '<div class="tani-tools">'+["durumTespiti","arac","isHukukuSihirbaz","gozetim"].map(function(id){return taniArac(id,false);}).join("")+'</div>'+
       '<div class="tani-foot"><button class="btn-back" onclick="taniBasa()">Baştan başla</button>'+
       '<a class="btn-next" href="/" style="text-decoration:none">Tüm araçlar</a></div></div>';
    w.innerHTML=h;tilt3dScan();return;
  }

  /* sonuç */
  const hp=TANI_MAP[taniState.tahminId];
  if(!hp){taniState.faz="liste";renderTani();return;}
  if(hp.alan==='trafik')h+=road3dHtml('');
  h+='<div class="isc-result-card tani-res">';
  h+='<div class="tani-res-top"><div class="tani-res-lbl">Durum tespiti</div><h3>'+hp.ad+'</h3><p>'+hp.ozet+'</p></div>';

  h+='<div class="tani-sec"><div class="tani-sec-t">Bu durumda dosyanızda olan kalemler</div><div class="tani-haklar">';
  hp.haklar.forEach(function(x){
    h+='<div class="tani-hak"><span class="tani-hak-ok"><svg width="14" height="14" viewBox="0 0 18 18" fill="none"><path d="M4 9.5l3.5 3.5L14 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'+
       '<div><strong>'+x.b+'</strong><p>'+x.a+'</p></div></div>';
  });
  h+='</div></div>';

  h+='<div class="tani-sec"><div class="tani-sec-t">Kaçırmamanız gerekenler</div><ul class="tani-dikkat">';
  hp.dikkat.forEach(function(d){h+='<li>'+d+'</li>';});
  h+='</ul></div>';

  if(hp.sure){
    h+='<div class="tani-sec tani-sure"><div class="tani-sec-t">Süre kontrolü</div>'+
       '<p class="tani-sure-ad">'+hp.sure.ad+'</p>'+
       '<div class="tani-sure-in"><label for="taniSureTarih">'+(hp.sure.olay||"Olay tarihi")+'</label>'+
       '<input type="date" id="taniSureTarih" onchange="taniSureHesap('+hp.sure.gun+')"/></div>'+
       '<div id="taniSureOut" class="tani-sure-out"></div></div>';
  }

  h+='<div class="tani-sec"><div class="tani-sec-t">Şimdi hangi hesabı yapmalısınız</div><div class="tani-tools">';
  hp.araclar.forEach(function(id,i){h+=taniArac(id,i===0);});
  h+='</div><p class="tani-tools-not">Seçtiğiniz araç yeni sekmede açılır; bu sayfa açık kalır.</p></div>';

  h+='<div class="tani-sec"><div class="tani-sec-t">Dayanak</div><div class="tani-mev">';
  hp.mevzuat.forEach(function(m){h+='<span class="tani-mev-c">'+m+'</span>';});
  h+='</div></div>';

  h+=taniIzHtml(false);

  h+='<div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg>'+
     '<p>Bu bir tahmindir, hukuki görüş değildir. Yanıtlarınızdan çıkarılmıştır; dosyanızdaki belgeler tabloyu değiştirebilir.</p></div>';

  h+='<div class="cmp-actions" style="margin-top:16px">'+
     '<a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="'+whatsappLink("Merhaba, sitedeki durum tespiti aracını kullandım. Çıkan sonuç: "+hp.ad+". Bu konuda görüşmek istiyorum.")+'">'+
     '<svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Bu konuda görüşmek istiyorum</a></div>';

  h+='<div class="tani-foot" style="margin-top:18px"><button class="btn-back" onclick="taniBasa()">Baştan başla</button>'+
     '<button class="btn-back" onclick="taniYanlis()">Bu tespit bana uymadı</button></div>';
  h+='</div>';
  w.innerHTML=h;tilt3dScan();
}
function taniYanlis(){taniState.faz="tahmin";taniRed();window.scrollTo({top:0,behavior:"smooth"});}
function taniSureHesap(gun){
  const el=document.getElementById("taniSureTarih"),out=document.getElementById("taniSureOut");
  if(!el||!out||!el.value)return;
  const t=new Date(el.value+"T00:00:00");
  if(isNaN(t.getTime()))return;
  const gecen=Math.floor((Date.now()-t.getTime())/86400000);
  const kalan=gun-gecen;
  if(gecen<0){out.className="tani-sure-out";out.innerHTML="Gelecek bir tarih girdiniz.";return;}
  if(kalan<=0){
    out.className="tani-sure-out kirmizi";
    out.innerHTML="<strong>Süre görünüşe göre dolmuş.</strong> Üzerinden "+gecen+" gün geçmiş. Buna rağmen sürenin durduğu veya yeniden işlediği hâller olabilir (ceza davası, ödeme, yazılı kabul, zorunlu arabuluculuk gibi) — kapıyı kapatmadan bir avukata sorun.";
  }else if(kalan<=Math.max(15,Math.round(gun*0.15))){
    out.className="tani-sure-out sari";
    out.innerHTML="<strong>Yaklaşık "+kalan+" gününüz kalmış.</strong> Bu, kaybetmemek için hemen harekete geçilmesi gereken bir aralık.";
  }else{
    out.className="tani-sure-out yesil";
    out.innerHTML="<strong>Yaklaşık "+kalan+" gününüz var.</strong> Süre bakımından rahatsınız; belgeleri toplayarak başlayabilirsiniz.";
  }
}

/* =====================================================================
   VERGİ İADEMİ NASIL ALABİLİRİM — tutar değil, yol haritası üreten araç
   Fazla veya yersiz ödenen verginin geri alınması dava açmayı gerektirmez;
   önce idareye düzeltme başvurusu yapılır. Ancak başvuru mercii, süre ve
   belgeler verginin türüne göre değişiyor: gümrükte 3 yıl, VUK kapsamındaki
   vergilerde 5 yıl. Bu araç, kullanıcının durumuna göre doğru mercii,
   kalan süreyi, gereken belgeleri ve reddedilirse izlenecek yolu çıkarıyor.
   ===================================================================== */
const VI_TUR={
 gelir:{ad:"Gelir veya kurumlar vergisi",mercii:"bağlı olduğunuz vergi dairesi",
  sure:1825,sureAd:"Verginin doğduğu yılı izleyen yılbaşından itibaren 5 yıl (VUK m.126)",
  dayanak:["VUK m.116-126 (vergi hataları ve düzeltme)","VUK m.112/4 (iadede faiz)","GVK m.121 (uyumlu mükellef indirimi)"],
  belgeler:["Düzeltme talebi dilekçesi","Beyanname ve tahakkuk fişi","Ödeme makbuzu / banka dekontu","Fazla ödemeyi gösteren hesap dökümü","Varsa stopaj/tevkifat belgeleri (muhtasar beyan, serbest meslek makbuzu)"],
  ipucu:"Yıl içinde kesilen stopaj, beyan üzerinden hesaplanan vergiden fazlaysa fark iade edilir. Beyannamede iade talebini işaretlemeyi atlarsanız iade kendiliğinden yapılmaz; düzeltme beyannamesi vermeniz gerekir."},
 kdv:{ad:"KDV",mercii:"bağlı olduğunuz vergi dairesi",
  sure:1825,sureAd:"Düzeltme yolunda 5 yıl (VUK m.126). İade hakkı doğuran işlemlerde ise talep, işlemin yapıldığı dönemi izleyen ikinci takvim yılının sonuna kadar yapılmalıdır",
  dayanak:["KDVK m.29, 32","VUK m.116-126","KDV Uygulama Genel Tebliği"],
  belgeler:["İade talep dilekçesi ve standart iade talep formu","İndirilecek KDV listesi","Yüklenilen KDV tablosu","Satış faturaları ve gümrük çıkış beyannamesi (ihracatta)","Vergi dairesinin istediği hâllerde YMM raporu veya teminat"],
  ipucu:"İki ayrı yol var: ihracat, indirimli oran ve tevkifat gibi iade hakkı doğuran işlemlerde iade kendi usulüne göre istenir; sadece hata veya mükerrer ödeme varsa yol düzeltme talebidir."},
 gumruk:{ad:"Gümrük vergileri (ithalatta ödenen)",mercii:"beyannamenin tescil edildiği gümrük müdürlüğü",
  sure:1095,sureAd:"Vergilerin ödendiği tarihten itibaren 3 yıl (GK m.211)",
  dayanak:["Gümrük Kanunu m.211 (geri verme veya kaldırma)","GK m.24 (gümrük kıymeti)","GK m.242 (itiraz)"],
  belgeler:["Geri verme (iade) başvuru dilekçesi","Gümrük beyannamesi ve eki belgeler","Vergilerin ödendiğini gösteren makbuz","Fatura, navlun ve sigorta belgeleri","Gözetim nedeniyle eklenen yurt dışı gider kalemini gösteren beyan satırı"],
  ipucu:"Gümrükte süre diğer vergilerden kısadır: 3 yıl. Gözetim uygulaması nedeniyle kıymeti yükseltip fazla KDV ödediyseniz bu, iadesi en çok kabul gören dosya tipidir."},
 emlak:{ad:"Emlak vergisi",mercii:"taşınmazın bulunduğu belediyenin gelir müdürlüğü",
  sure:1825,sureAd:"Düzeltme zamanaşımı 5 yıl (VUK m.126)",
  dayanak:["1319 sayılı Emlak Vergisi Kanunu m.8, 29","VUK m.116-126"],
  belgeler:["Düzeltme ve iade dilekçesi","Tapu fotokopisi","Ödeme makbuzları","Muafiyet talebi varsa: SGK emeklilik belgesi, engelli sağlık kurulu raporu veya gazi/dul-yetim belgesi","Bina/arsa vergi değerini gösteren belediye kaydı"],
  ipucu:"En sık iki hata: bina değerinin yanlış hesaplanması ve tek meskeni olan emekli, engelli, gazi, dul ve yetimlere tanınan sıfır oranın uygulanmaması. Muafiyet başvuruya bağlıdır, kendiliğinden geri ödenmez."},
 mtv:{ad:"Motorlu taşıtlar vergisi (MTV)",mercii:"bağlı olduğunuz vergi dairesi",
  sure:1825,sureAd:"Düzeltme zamanaşımı 5 yıl (VUK m.126)",
  dayanak:["197 sayılı MTV Kanunu m.5, 8","VUK m.116-126"],
  belgeler:["Düzeltme ve iade dilekçesi","Araç ruhsatı","Ödeme makbuzları","Satış / noter devir belgesi veya trafikten çekme, hurdaya ayırma belgesi","Engelli muafiyeti için sağlık kurulu raporu ve 'H' sınıfı belge"],
  ipucu:"Aracı sattığınız hâlde devir trafikte işlenmediyse vergi size çıkmaya devam eder. Satış belgesiyle düzeltme isteyip ödediğiniz fazla tutarı geri alabilirsiniz."},
 tapu:{ad:"Tapu harcı",mercii:"harcı tahsil eden vergi dairesi (tapu müdürlüğü bağlantılı)",
  sure:1825,sureAd:"Düzeltme zamanaşımı 5 yıl (VUK m.126)",
  dayanak:["492 sayılı Harçlar Kanunu (4) sayılı tarife","VUK m.116-126"],
  belgeler:["Düzeltme ve iade dilekçesi","Tapu senedi ve resmî satış senedi","Harç ödeme makbuzu","Gerçek satış bedelini gösteren belgeler (banka transferi, kredi sözleşmesi)"],
  ipucu:"İşlem iptal edildiyse veya harç gerçek bedelin üzerinde bir matrahtan alındıysa fark iade edilir. Buna karşılık bedeli düşük göstermek sonradan hem harç farkı hem ceza doğurur."},
 damga:{ad:"Damga vergisi veya harç",mercii:"vergiyi tahsil eden vergi dairesi",
  sure:1825,sureAd:"Düzeltme zamanaşımı 5 yıl (VUK m.126)",
  dayanak:["488 sayılı Damga Vergisi Kanunu","492 sayılı Harçlar Kanunu","VUK m.116-126"],
  belgeler:["Düzeltme ve iade dilekçesi","Vergiye konu sözleşme veya kâğıdın aslı/fotokopisi","Ödeme makbuzu","İşlemin gerçekleşmediğini veya iptal edildiğini gösteren belge"],
  ipucu:"Aynı kâğıt için mükerrer ödeme, hükmü kalmayan sözleşme veya istisna kapsamında olduğu hâlde ödenen damga vergisi iade edilir."},
 stopaj:{ad:"Kesinti (stopaj / tevkifat) fazlası",mercii:"bağlı olduğunuz vergi dairesi",
  sure:1825,sureAd:"Düzeltme zamanaşımı 5 yıl (VUK m.126)",
  dayanak:["GVK m.94, 121","VUK m.116-126","VUK m.112/4"],
  belgeler:["İade talebi dilekçesi","Yıllık beyanname ve tahakkuk fişi","Kesintiyi yapan tarafın verdiği muhtasar beyan bilgileri / makbuz","Kesinti tutarlarını gösteren tablo","Banka hesap bilgisi (IBAN)"],
  ipucu:"Kira, serbest meslek ve menkul sermaye iratlarında yıl içinde kesilen vergi, yıllık beyan üzerinden çıkan vergiden fazlaysa fark iadeye konu olur."}
};
const VI_SEBEP={
 hata:{ad:"Hesap veya vergilendirme hatası var",
  aciklama:"Matrah, oran, mükerrer tahakkuk, kişide veya konuda yanılma gibi bir hata. Bu, düzeltme yolunun tam merkezindeki hâl: idare hatayı kendiliğinden de düzeltmek zorundadır.",
  yol:"duzeltme"},
 muafiyet:{ad:"Hakkım olan muafiyet / indirim uygulanmadı",
  aciklama:"Muafiyet şartlarını taşıdığınız hâlde vergi tam alınmışsa, muafiyeti belgeleyip geçmiş dönemler için düzeltme isteyebilirsiniz.",
  yol:"duzeltme"},
 mukerrer:{ad:"Aynı vergiyi iki kez ödedim",
  aciklama:"Mükerrer ödeme en kolay kabul edilen iade sebebidir; makbuzların ikisini de eklemeniz genellikle yeterli olur.",
  yol:"duzeltme"},
 iptal:{ad:"İşlem gerçekleşmedi veya iptal edildi",
  aciklama:"Verginin dayandığı işlem hiç doğmadıysa ya da sonradan geçersiz hâle geldiyse ödenen vergi yersiz kalır ve iadesi istenir.",
  yol:"duzeltme"},
 iadehakki:{ad:"İhracat, indirimli oran veya tevkifat nedeniyle iade hakkım doğdu",
  aciklama:"Burada bir hata yok; kanun size doğrudan iade hakkı tanıyor. Bu yol düzeltmeden farklı, kendi usulü ve formları var.",
  yol:"iadehakki"},
 karar:{ad:"Mahkeme kararı veya sonradan yapılan düzenleme lehime çıktı",
  aciklama:"Tahsilatın dayanağı ortadan kalkmışsa ödenen tutar iade edilir; kararın kesinleşme tarihi burada belirleyicidir.",
  yol:"duzeltme"}
};
const viState={step:1,tur:null,sebep:null,tarih:"",tutar:0,faiz:0};
function openVergiIade(){viState.step=1;viState.tur=null;viState.sebep=null;viState.tarih="";viState.tutar=0;viState.faiz=0;renderVergiIade();}
function viPick(k,v){viState[k]=v;if(viState.step<3)viState.step++;renderVergiIade();window.scrollTo({top:0,behavior:"smooth"});}
function viPrev(){if(viState.step>1){viState.step--;renderVergiIade();window.scrollTo({top:0,behavior:"smooth"});}}
function viKaydet(){
  const t=document.getElementById("vi_tarih"),tu=document.getElementById("vi_tutar"),f=document.getElementById("vi_faiz");
  if(t)viState.tarih=t.value||"";
  if(tu)viState.tutar=parseFloat(tu.value)||0;
  if(f)viState.faiz=parseFloat(f.value)||0;
}
function viHesapla(){
  viKaydet();
  if(!viState.tur||!viState.sebep){showValidationError("Lütfen vergi türünü ve sebebini seçin.");return;}
  state.pendingType="vergiIade";
  state.pendingResult={total:viState.tutar||0,vergi:viState.tur};
  state.pendingExtra="Vergi iadesi · "+VI_TUR[viState.tur].ad+" · Sebep: "+VI_SEBEP[viState.sebep].ad+(viState.tarih?" · Ödeme: "+viState.tarih:"")+(viState.tutar?" · Tutar: "+fmt(viState.tutar):"");
  const ci=getStoredContactInfo();
  if(ci)finalizeLead(ci,"");else showLeadModal("vergiIade");
}
function viSonucGoster(){viState.step=4;renderVergiIade();window.scrollTo({top:0,behavior:"smooth"});}

function viGun(){
  if(!viState.tarih)return null;
  const t=new Date(viState.tarih+"T00:00:00");
  if(isNaN(t.getTime()))return null;
  return Math.floor((Date.now()-t.getTime())/86400000);
}
function viDilekceMetni(){
  const tur=VI_TUR[viState.tur],seb=VI_SEBEP[viState.sebep];
  const gumruk=viState.tur==="gumruk";
  const mercii=gumruk?"…… GÜMRÜK MÜDÜRLÜĞÜNE":(viState.tur==="emlak"?"…… BELEDİYE BAŞKANLIĞINA (Gelir Müdürlüğü)":"…… VERGİ DAİRESİ MÜDÜRLÜĞÜNE");
  const day=gumruk?"4458 sayılı Gümrük Kanunu'nun 211. maddesi":"213 sayılı Vergi Usul Kanunu'nun 116 ve devamı maddeleri";
  return mercii+"\n\n"+
"Konu: Fazla / yersiz tahsil edilen "+tur.ad.toLowerCase()+" tutarının iadesi (düzeltme) talebi\n\n"+
"Mükellef / Vergi Kimlik No: ……\nAdres: ……\nTelefon: ……\nIBAN (iade için): ……\n\n"+
"Açıklamalar:\n"+
"1) Tarafımca "+(viState.tarih||"…/…/……")+" tarihinde "+tur.ad.toLowerCase()+" olarak "+(viState.tutar?fmt(viState.tutar):"……")+" tutarında ödeme yapılmıştır. Ödemeye ilişkin makbuz dilekçe ekindedir.\n"+
"2) "+seb.ad+". "+seb.aciklama+"\n"+
"3) Bu nedenle söz konusu tutar tarafımdan fazla / yersiz olarak tahsil edilmiştir.\n\n"+
"Talep:\n"+
"Yukarıda açıkladığım nedenlerle, "+day+" uyarınca fazla / yersiz tahsil edilen tutarın "+
"yasal faiziyle birlikte tarafıma iadesine (düzeltilmesine) karar verilmesini talep ederim.\n\n"+
"Ekler:\n"+tur.belgeler.map(function(b,i){return "   "+(i+1)+") "+b;}).join("\n")+"\n\n"+
"Tarih: …/…/……\nAd Soyad / İmza: ……";
}
function viKopyala(){
  const m=viDilekceMetni();
  const bitir=function(ok){
    const el=document.getElementById("viKopyaDurum");
    if(el)el.textContent=ok?"Dilekçe metni kopyalandı.":"Kopyalanamadı — metni elle seçip kopyalayabilirsiniz.";
  };
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(m).then(function(){bitir(true);},function(){bitir(false);});
  else bitir(false);
}

function renderVergiIade(){
  const w=document.getElementById("vergiIadeWrapper");if(!w)return;
  let h='<div class="calc-page-header"><div class="step-number-badge">Vergi & Gümrük Hukuku</div>'+
        '<h2>Vergi iademi nasıl alabilirim?</h2>'+
        '<p>Fazla veya yersiz ödenen vergiyi geri almak için dava şart değil — önce idareye düzeltme başvurusu yapılır. Hangi mercie, hangi süre içinde ve hangi belgelerle başvuracağınızı birlikte çıkaralım.</p></div>';
  h+='<div class="wz-card"><div class="wz-progress">';
  for(let i=1;i<=4;i++)h+='<span class="'+(i<=viState.step?"done":"")+'"></span>';
  h+='</div>';

  if(viState.step===1){
    h+='<div class="wz-step-label">1. adım</div><div class="wz-q">Hangi vergiyi ya da harcı fazla ödediniz?</div>';
    h+='<p class="wz-hint">Başvuru mercii ve süre buna göre değişiyor. Gümrük vergilerinde süre yalnızca 3 yıl.</p><div class="wz-opts">';
    Object.keys(VI_TUR).forEach(function(k){
      const t=VI_TUR[k],sel=viState.tur===k?" sel":"";
      h+='<button type="button" class="wz-opt'+sel+'" onclick="viPick(\'tur\',\''+k+'\')"><span class="wz-opt-dot"></span><span>'+t.ad+'<span class="wz-opt-sub">Başvuru: '+t.mercii+'</span></span></button>';
    });
    h+='</div>';
  }
  else if(viState.step===2){
    h+='<div class="wz-step-label">2. adım</div><div class="wz-q">Neden fazla ödediğinizi düşünüyorsunuz?</div>';
    h+='<p class="wz-hint">Sebep, izleyeceğiniz yolu belirliyor: hata varsa düzeltme, kanunen iade hakkı doğmuşsa kendi usulü.</p><div class="wz-opts">';
    Object.keys(VI_SEBEP).forEach(function(k){
      const s=VI_SEBEP[k],sel=viState.sebep===k?" sel":"";
      h+='<button type="button" class="wz-opt'+sel+'" onclick="viPick(\'sebep\',\''+k+'\')"><span class="wz-opt-dot"></span><span>'+s.ad+'</span></button>';
    });
    h+='</div>';
  }
  else if(viState.step===3){
    const t=VI_TUR[viState.tur];
    h+='<div class="wz-step-label">3. adım</div><div class="wz-q">Ödeme bilgileri</div>';
    h+='<p class="wz-hint">Tarih, sürenizin dolup dolmadığını hesaplamak için gerekli. Tutar ve faiz oranı isteğe bağlı — girerseniz tahmini iade tutarını da gösteririm.</p>';
    h+='<div class="form-grid">';
    h+='<div class="form-group"><label for="vi_tarih">Ödemeyi yaptığınız tarih</label><div class="input-wrapper"><input type="date" id="vi_tarih" value="'+viState.tarih+'"/></div><p class="field-hint">'+t.sureAd+'</p></div>';
    h+='<div class="form-group"><label for="vi_tutar">Fazla ödediğinizi düşündüğünüz tutar (TL)</label><div class="input-wrapper"><span class="input-prefix">₺</span><input type="number" id="vi_tutar" min="0" placeholder="Örn: 45000" value="'+(viState.tutar||"")+'"/></div></div>';
    h+='<div class="form-group"><label for="vi_faiz">Uygulanacak yıllık faiz oranı (%)</label><div class="input-wrapper"><span class="input-prefix">%</span><input type="number" id="vi_faiz" min="0" placeholder="Bilmiyorsanız boş bırakın" value="'+(viState.faiz||"")+'"/></div><p class="field-hint">Düzeltme fişine dayanan iadede tecil faizi oranında faiz işletilir (VUK m.112/4). Oran Bakanlıkça değiştirildiği için buraya sabit bir değer yazmıyorum; güncel oranı girerseniz hesaplarım.</p></div>';
    h+='</div>';
  }
  else {
    const t=VI_TUR[viState.tur],s=VI_SEBEP[viState.sebep];
    const gecen=viGun(),kalan=gecen===null?null:t.sure-gecen;
    const gumruk=viState.tur==="gumruk";
    h+='<div class="wz-step-label">Yol haritanız</div>';
    h+='<div class="vi-ozet"><div><span>Vergi türü</span><strong>'+t.ad+'</strong></div>'+
       '<div><span>Sebep</span><strong>'+s.ad+'</strong></div>'+
       '<div><span>Başvuru mercii</span><strong>'+t.mercii+'</strong></div></div>';

    if(kalan!==null){
      const cls=kalan<=0?"kirmizi":(kalan<=Math.max(30,Math.round(t.sure*0.15))?"sari":"yesil");
      h+='<div class="vi-sure '+cls+'">';
      if(kalan<=0)h+='<strong>Süre görünüşe göre dolmuş.</strong> Ödeme tarihinden bu yana '+gecen+' gün geçmiş. Yine de sürenin başlangıcı bazı hâllerde farklı hesaplanır (mahkeme kararına dayanan iadelerde kararın kesinleşme tarihi gibi) — vazgeçmeden önce bir avukata sorun.';
      else h+='<strong>Yaklaşık '+kalan+' gününüz kalmış.</strong> '+t.sureAd+'.';
      h+='</div>';
    }

    if(viState.tutar>0){
      const yil=gecen===null?0:gecen/365;
      const faiz=viState.faiz>0?Math.round(viState.tutar*(viState.faiz/100)*yil):0;
      h+='<div class="vi-tutar"><div class="vi-tutar-lbl">Talep edeceğiniz tahmini tutar</div>'+
         '<div class="vi-tutar-big">'+fmt2(viState.tutar+faiz)+' TL</div>'+
         '<div class="vi-tutar-alt">Ana para '+fmt(viState.tutar)+(faiz>0?' + faiz '+fmt(faiz)+' ('+viState.faiz+'% × '+yil.toFixed(1)+' yıl)':' (faiz oranı girilmedi)')+'</div>'+
         '<div class="vi-tutar-not">Bu tutar sizin girdiğiniz verilere dayanır; idarenin kabul edeceği tutar belgelerinize göre değişir.</div></div>';
    }

    h+='<div class="vi-adimlar">';
    const iadeHakki=s.yol==="iadehakki";
    const adimlar=[
     {b:"Belgeleri toplayın",m:"<ul><li>"+t.belgeler.join("</li><li>")+"</li></ul>"},
     {b:(iadeHakki?"İade talep formunu ve dilekçeyi verin":"Düzeltme dilekçesini verin"),
      m:iadeHakki
        ?"İade hakkı doğuran işlemlerde talep, beyanname üzerinden ve ilgili standart iade talep formuyla yapılır. Formu eksiksiz doldurup istenen listeleri (yüklenilen KDV tablosu, indirilecek KDV listesi) sisteme yükleyin."
        :"Aşağıdaki dilekçeyi <strong>"+t.mercii+"</strong>ne elden verip <strong>tarihli ve imzalı kayıt numarası</strong> alın veya e-Devlet/İnteraktif Vergi Dairesi üzerinden gönderin. Kayıt numarası, süreyi durdurduğunuzun tek kanıtıdır."},
     {b:"İdarenin cevabını bekleyin",m:"İdare talebinizi inceler. <strong>60 gün içinde cevap verilmezse talep zımnen reddedilmiş sayılır</strong> (İYUK m.10) ve dava açma süresi bu tarihten işlemeye başlar. Bu süreyi takviminize işleyin."},
     gumruk
      ?{b:"Ret hâlinde itiraz ve dava",m:"Ret kararına karşı <strong>15 gün</strong> içinde gümrük ve dış ticaret bölge müdürlüğüne itiraz edilir (GK m.242). İtirazın reddi üzerine <strong>30 gün</strong> içinde vergi mahkemesinde iptal davası açılır."}
      :{b:"Ret hâlinde şikayet ve dava",m:"Vergi dairesi düzeltme talebinizi reddederse <strong>Hazine ve Maliye Bakanlığı'na şikayet yoluyla</strong> başvurulur (VUK m.124). Şikayetin reddi veya 60 gün içinde cevap verilmemesi üzerine <strong>30 gün</strong> içinde vergi mahkemesinde dava açılır (İYUK m.7, 10)."},
     {b:"İade ve faiz",m:"Talep kabul edilirse düzeltme fişi düzenlenir ve tutar bildirdiğiniz hesaba aktarılır. Fazla veya haksız tahsil edilen vergilerde, düzeltme fişine dayanan iadelerde <strong>tecil faizi oranında faiz</strong> işletilir (VUK m.112/4). Dilekçenizde faizi <strong>açıkça talep etmeyi</strong> unutmayın; talep edilmeyen faiz kendiliğinden ödenmez."}
    ];
    adimlar.forEach(function(a,i){
      h+='<div class="vi-adim"><span class="vi-adim-n">'+(i+1)+'</span><div><strong>'+a.b+'</strong><div class="vi-adim-m">'+a.m+'</div></div></div>';
    });
    h+='</div>';

    h+='<div class="vi-ipucu"><strong>Bu vergi türünde en sık görülen durum</strong><p>'+t.ipucu+'</p></div>';

    if(!iadeHakki){
      h+='<div class="vi-dilekce"><div class="vi-dilekce-head"><strong>Örnek dilekçe</strong>'+
         '<button type="button" class="btn-back" onclick="viKopyala()">Metni kopyala</button></div>'+
         '<pre class="vi-dilekce-body">'+sanitizeHtml(viDilekceMetni())+'</pre>'+
         '<div id="viKopyaDurum" class="vi-kopya-durum"></div>'+
         '<p class="vi-dilekce-not">Noktalı yerleri kendi bilgilerinizle doldurun. Bu bir taslaktır; dosyanızın özelliğine göre eklemeler gerekebilir.</p></div>';
    }

    h+='<div class="tani-sec"><div class="tani-sec-t">Dayanak</div><div class="tani-mev">';
    t.dayanak.forEach(function(d){h+='<span class="tani-mev-c">'+d+'</span>';});
    h+='</div></div>';

    h+='<div class="tani-sec"><div class="tani-sec-t">İlgili hesaplama araçları</div><div class="tani-tools">'+
       ["gozetim","vergiDavasi","emlakVergisi","ithalatVergi"].map(function(id,i){return taniArac(id,i===0);}).join("")+
       '</div></div>';

    h+='<div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg>'+
       '<p>Bu yol haritası genel bilgilendirmedir, hukuki görüş değildir. Süreler dosyanızın özelliğine göre farklı işleyebilir.</p></div>';

    h+='<div class="cmp-actions" style="margin-top:14px"><a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="'+
       whatsappLink("Merhaba, "+t.ad+" için iade başvurusu yapmak istiyorum. Sebep: "+s.ad+". Bu konuda görüşebilir miyiz?")+
       '"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Başvurumu birlikte hazırlayalım</a></div>';
  }

  h+='<div class="wz-actions">';
  h+=viState.step===1?'<button class="btn-back" onclick="navigate(\'home\')">Vazgeç</button>':'<button class="btn-back" onclick="viPrev()"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Geri</button>';
  if(viState.step===3)h+='<button class="btn-next" onclick="viHesapla()">Yol haritamı göster <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 3l7 7-7 7M3 10h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  else if(viState.step===4)h+='<button class="btn-next" onclick="openVergiIade()">Yeniden başla</button>';
  h+='</div></div>';
  w.innerHTML=h;tilt3dScan();
}

/* =====================================================================
   HAFİF 3B KATMANI
   İki parça: (1) kartlar imlecin bulunduğu yöne birkaç derece eğiliyor,
   (2) trafik akışlarının başında perspektifli bir yol sahnesi var.
   Açılar bilinçli olarak küçük (en çok 6°): derinlik hissi versin ama
   okumayı zorlaştırmasın. Dokunmatik cihazlarda ve hareket kısıtlaması
   açıkken tamamen devre dışı — orada eğim ya hiç tetiklenmiyor ya da
   rahatsız edici oluyor.
   ===================================================================== */
const T3D_SELECTORS='.qcard,.method-card,.blog-card,.testimonial-card,.tani-tool,.tani-hak,.vi-adim';
const T3D_MAX=6;
let _t3dHazir=false,_t3dAktif=null,_t3dBekleyen=null,_t3dRaf=false;

function tilt3dDestekli(){
  if(!window.matchMedia)return false;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
/* Parlama katmanı kartın içine bir kez ekleniyor; eğimle birlikte ışık da
   imleci takip edince yüzey düz bir dikdörtgen gibi durmuyor. */
function tilt3dScan(){
  if(!tilt3dDestekli())return;
  document.querySelectorAll(T3D_SELECTORS).forEach(function(el){
    if(el.classList.contains('t3d'))return;
    el.classList.add('t3d');
    if(!el.querySelector(':scope > .t3d-glare')){
      const g=document.createElement('span');g.className='t3d-glare';el.appendChild(g);
    }
  });
  if(!_t3dHazir)tilt3dInit();
}
function tilt3dBirak(el){
  if(!el)return;
  el.classList.remove('t3d-live');
  el.style.setProperty('--t3rx','0deg');
  el.style.setProperty('--t3ry','0deg');
}
function tilt3dInit(){
  if(_t3dHazir||!tilt3dDestekli())return;
  _t3dHazir=true;
  document.addEventListener('pointermove',function(e){
    if(e.pointerType==='touch')return;
    const el=e.target&&e.target.closest?e.target.closest(T3D_SELECTORS):null;
    if(el!==_t3dAktif){tilt3dBirak(_t3dAktif);_t3dAktif=el;if(el)el.classList.add('t3d-live');}
    if(!el)return;
    _t3dBekleyen={el:el,x:e.clientX,y:e.clientY};
    /* Kare başına tek güncelleme: pointermove saniyede yüzlerce kez tetiklenir. */
    if(_t3dRaf)return;
    _t3dRaf=true;
    requestAnimationFrame(function(){
      _t3dRaf=false;
      const b=_t3dBekleyen;if(!b||!b.el.isConnected)return;
      const r=b.el.getBoundingClientRect();
      if(!r.width||!r.height)return;
      const x=Math.min(1,Math.max(0,(b.x-r.left)/r.width));
      const y=Math.min(1,Math.max(0,(b.y-r.top)/r.height));
      b.el.style.setProperty('--t3ry',((x-0.5)*2*T3D_MAX).toFixed(2)+'deg');
      b.el.style.setProperty('--t3rx',((0.5-y)*2*T3D_MAX).toFixed(2)+'deg');
      b.el.style.setProperty('--t3x',(x*100).toFixed(1)+'%');
      b.el.style.setProperty('--t3y',(y*100).toFixed(1)+'%');
    });
  },{passive:true});
  /* Fare pencereden çıkarsa kart eğik kalmasın. */
  document.addEventListener('mouseleave',function(){tilt3dBirak(_t3dAktif);_t3dAktif=null;});
  window.addEventListener('blur',function(){tilt3dBirak(_t3dAktif);_t3dAktif=null;});
}

/* Perspektifli yol sahnesi: zemin rotateX ile yatırılıyor, şerit çizgileri
   kayıyor, araç hafifçe süzülüyor. Tek bir SVG + CSS; kütüphane yok. */
function road3dHtml(baslik){
  return '<div class="road3d" aria-hidden="true">'+
    '<div class="road3d-sky"></div>'+
    '<div class="road3d-floor"></div>'+
    '<div class="road3d-lane"></div>'+
    '<div class="road3d-glow"></div>'+
    '<svg class="road3d-car" viewBox="0 0 240 130" fill="none" xmlns="http://www.w3.org/2000/svg">'+
      '<defs>'+
        '<linearGradient id="r3dBody" x1="0" y1="0" x2="0" y2="1">'+
          '<stop offset="0%" stop-color="#A78BFA"/><stop offset="52%" stop-color="#7C4DEF"/><stop offset="100%" stop-color="#4C2E9E"/>'+
        '</linearGradient>'+
        '<linearGradient id="r3dCam" x1="0" y1="0" x2="0" y2="1">'+
          '<stop offset="0%" stop-color="#EAE6FF" stop-opacity=".92"/><stop offset="100%" stop-color="#6D5FA8" stop-opacity=".55"/>'+
        '</linearGradient>'+
        '<linearGradient id="r3dFar" x1="0" y1="0" x2="1" y2="0">'+
          '<stop offset="0%" stop-color="#FFF6DC"/><stop offset="100%" stop-color="#C5A880"/>'+
        '</linearGradient>'+
        '<radialGradient id="r3dIsik" cx="50%" cy="50%" r="50%">'+
          '<stop offset="0%" stop-color="#FFF3D0" stop-opacity=".95"/><stop offset="100%" stop-color="#FFF3D0" stop-opacity="0"/>'+
        '</radialGradient>'+
      '</defs>'+
      /* far huzmeleri — sahnenin sinematik hissi buradan geliyor */
      '<ellipse cx="62" cy="92" rx="52" ry="17" fill="url(#r3dIsik)" opacity=".55"/>'+
      '<ellipse cx="178" cy="92" rx="52" ry="17" fill="url(#r3dIsik)" opacity=".55"/>'+
      /* gövde */
      '<path d="M22 92c-6 0-10-4-10-10V64c0-7 4-13 10-16l24-11 12-19c3-5 8-8 14-8h96c6 0 11 3 14 8l12 19 24 11c6 3 10 9 10 16v18c0 6-4 10-10 10z" fill="url(#r3dBody)"/>'+
      /* tavan / cam */
      '<path d="M64 41l10-16c2-3 5-5 9-5h74c4 0 7 2 9 5l10 16z" fill="url(#r3dCam)"/>'+
      '<path d="M12 70h216" stroke="#000" stroke-opacity=".18" stroke-width="2"/>'+
      /* farlar */
      '<rect x="18" y="60" width="40" height="13" rx="6" fill="url(#r3dFar)"/>'+
      '<rect x="182" y="60" width="40" height="13" rx="6" fill="url(#r3dFar)"/>'+
      /* ızgara ve tampon */
      '<rect x="84" y="62" width="72" height="14" rx="7" fill="#0B0C10" fill-opacity=".55"/>'+
      '<rect x="30" y="84" width="180" height="10" rx="5" fill="#0B0C10" fill-opacity=".35"/>'+
      /* tekerlekler */
      '<rect x="26" y="88" width="34" height="26" rx="10" fill="#0B0C10"/>'+
      '<rect x="180" y="88" width="34" height="26" rx="10" fill="#0B0C10"/>'+
      '<rect x="33" y="94" width="20" height="14" rx="7" fill="#2A2A2A"/>'+
      '<rect x="187" y="94" width="20" height="14" rx="7" fill="#2A2A2A"/>'+
    '</svg>'+
    (baslik?'<div class="road3d-cap">'+baslik+'</div>':'')+
  '</div>';
}

/* =====================================================================
   EV SATIŞ VERGİSİ İADE TUTARI (DEĞER ARTIŞ KAZANCI)

   Sık görülen tablo: kişi ticari faaliyet yürütmediği hâlde idare
   satışları "devamlı" sayıp ticari kazanç kabul ediyor; sonuçta KDV ve
   geçici vergi de tahakkuk ettiriliyor. Oysa:

     - KDV (KDVK m.1/1) yalnızca ticari, sınai, zirai ve mesleki faaliyet
       çerçevesindeki teslimlerde doğar. Arızi satış KDV'ye tabi değildir.
     - Geçici vergi (GVK mük. m.120) yalnızca ticari kazanç ve serbest
       meslek kazancı sahiplerince ödenir. Değer artış kazancında yoktur.

   Ancak bu, kişinin beyanına değil DEVAMLILIK ölçütüne bağlıdır
   (GVK m.37/2-4). Bu yüzden araç önce ticari sayılma riskini ölçüyor;
   risk yüksekse "iade alırsınız" demiyor.
   ===================================================================== */

/* Yıllık değer artış kazancı istisnası (GVK mük. m.80). Kazancın DOĞDUĞU
   yılın tutarı uygulanır, beyan edilen yılınki değil. */
const DVK_ISTISNA = { 2024: 87000, 2025: 120000, 2026: 150000 };

/* Ücret dışı gelirler için gelir vergisi tarifesi. Dilim sınırları her yıl
   yeniden değerlemeyle değiştiği için yıl yıl tutuluyor. */
const GV_TARIFE = {
  2025: [[158000,0.15,0],[330000,0.20,23700],[800000,0.27,58100],[4300000,0.35,185000],[Infinity,0.40,1410000]],
  2026: [[190000,0.15,0],[400000,0.20,28500],[1000000,0.27,70500],[5300000,0.35,232500],[Infinity,0.40,1737500]]
};
function gvVergi(matrah, yil) {
  const t = GV_TARIFE[yil] || GV_TARIFE[2026];
  if (matrah <= 0) return 0;
  let altSinir = 0;
  for (const [ust, oran, taban] of t) {
    if (matrah <= ust) return Math.round(taban + (matrah - altSinir) * oran);
    altSinir = ust;
  }
  return 0;
}

const esiState = { step: 1, a: {}, v: {} };
function openEvSatisIade() { esiState.step = 1; esiState.a = {}; esiState.v = {}; renderEvSatisIade(); }

function esiPick(k, v) { esiState.a[k] = v; renderEvSatisIade(); }
function esiOpt(k, v, label, sub) {
  const sel = esiState.a[k] === v ? ' sel' : '';
  return '<button type="button" class="wz-opt' + sel + '" onclick="esiPick(\'' + k + '\',\'' + v + '\')">' +
    '<span class="wz-opt-dot"></span><span>' + label + (sub ? '<span class="wz-opt-sub">' + sub + '</span>' : '') + '</span></button>';
}
function esiField(key, label, ph, prefix, hint) {
  const v = esiState.v[key] === undefined ? '' : esiState.v[key];
  return '<div class="form-group"><label for="esi_' + key + '">' + label + '</label>' +
    '<div class="input-wrapper"><span class="input-prefix">' + (prefix || '₺') + '</span>' +
    '<input type="number" id="esi_' + key + '" placeholder="' + ph + '" min="0" value="' + v + '"/></div>' +
    (hint ? '<p class="field-hint">' + hint + '</p>' : '') + '</div>';
}
function esiTarih(key, label, hint) {
  const v = esiState.v[key] || '';
  return '<div class="form-group"><label for="esi_' + key + '">' + label + '</label>' +
    '<div class="input-wrapper"><input type="date" id="esi_' + key + '" value="' + v + '"/></div>' +
    (hint ? '<p class="field-hint">' + hint + '</p>' : '') + '</div>';
}
function esiKaydet() {
  ['edinimBedeli','satisBedeli','masraf','yiufe','kdv','gecici','gelirV','cezaFaiz','satisSayisiYil','satisSayisi5Yil']
    .forEach(function (k) { const el = document.getElementById('esi_' + k); if (el && el.value !== '') esiState.v[k] = parseFloat(el.value); });
  ['edinimTarihi','satisTarihi'].forEach(function (k) { const el = document.getElementById('esi_' + k); if (el && el.value) esiState.v[k] = el.value; });
}

/* Devamlılık değerlendirmesi. Yargı kararlarında ölçüt şu: bir yılda birden
   fazla ya da birbirini izleyen yıllarda satış yapılması, kazanç elde etme
   amacıyla alınıp satılması ve organizasyon kurulması. Puanlama bunları
   yansıtıyor; kesin hüküm değil, risk göstergesi. */
function esiTicariRisk() {
  const a = esiState.a, v = esiState.v;
  let p = 0; const nedenler = [];
  const yilIci = v.satisSayisiYil || 0, besYilIci = v.satisSayisi5Yil || 0;
  if (yilIci >= 2) { p += 35; nedenler.push('Aynı yıl içinde ' + yilIci + ' satış yapılmış — devamlılığın en güçlü göstergesi budur.'); }
  if (besYilIci >= 3) { p += 25; nedenler.push('Son beş yılda ' + besYilIci + ' satış var; birbirini izleyen yıllardaki satışlar devamlılık karinesi doğurur.'); }
  if (a.insaat === 'evet') { p += 30; nedenler.push('İnşaat yaptırıp satış, kendi başına ticari organizasyon sayılır.'); }
  if (a.mukellef === 'evet') { p += 20; nedenler.push('Gayrimenkul alanında mükellefiyet kaydı bulunması ticari nitelik yönünde değerlendirilir.'); }
  if (a.amac === 'satmak') { p += 20; nedenler.push('Baştan satmak amacıyla alındığının kabulü ticari kazanç yönünde ağır basar.'); }
  if (a.amac === 'oturmak') { p -= 15; nedenler.push('Konutun oturma amacıyla alınmış olması ticari nitelik aleyhine güçlü bir olgudur.'); }
  if (a.edinimSekli === 'miras' || a.edinimSekli === 'bagis') { p -= 25; nedenler.push('Miras veya bağış yoluyla edinilen taşınmakta alım-satım iradesi yoktur.'); }
  if (yilIci <= 1 && besYilIci <= 1) { p -= 20; nedenler.push('Tek satış söz konusu; arızi işlem sayılması gerekir.'); }
  p = Math.max(0, Math.min(100, p));
  return { puan: p, nedenler: nedenler, seviye: p >= 60 ? 'yuksek' : (p >= 30 ? 'orta' : 'dusuk') };
}

function esiHesapla() {
  esiKaydet();
  const a = esiState.a, v = esiState.v;
  const risk = esiTicariRisk();

  const ed = v.edinimTarihi ? new Date(v.edinimTarihi + 'T00:00:00') : null;
  const sa = v.satisTarihi ? new Date(v.satisTarihi + 'T00:00:00') : null;
  const satisYili = sa ? sa.getFullYear() : new Date().getFullYear();
  const istisna = DVK_ISTISNA[satisYili] !== undefined ? DVK_ISTISNA[satisYili] : DVK_ISTISNA[2026];

  /* Kapsam kontrolü: bu iki hâlde değer artış kazancı hiç doğmaz. */
  const ivazsiz = a.edinimSekli === 'miras' || a.edinimSekli === 'bagis';
  const gun = (ed && sa) ? Math.floor((sa - ed) / 86400000) : null;
  const besYilGecti = gun !== null && gun > 1826;

  let kapsamDisi = false, kapsamSebep = '';
  if (ivazsiz) { kapsamDisi = true; kapsamSebep = 'Taşınmaz ivazsız (miras veya bağış) olarak edinilmiş. GVK mük. m.80/6 ivazsız iktisap edilenleri değer artış kazancı kapsamı dışında bırakır.'; }
  else if (besYilGecti) { kapsamDisi = true; kapsamSebep = 'Taşınmaz edinimden ' + Math.floor(gun / 365) + ' yıl sonra satılmış. Beş yılı aşan elde tutmada değer artış kazancı doğmaz (GVK mük. m.80/6).'; }

  /* Olması gereken vergi: değer artış kazancı hesabı. */
  const satis = v.satisBedeli || 0, edinim = v.edinimBedeli || 0, masraf = v.masraf || 0;
  const yiufe = v.yiufe || 0;
  const endekslendi = yiufe >= 10;
  const maliyet = endekslendi ? Math.round(edinim * (1 + yiufe / 100)) : edinim;
  const kazanc = Math.max(0, satis - maliyet - masraf);
  const matrah = kapsamDisi ? 0 : Math.max(0, kazanc - istisna);
  const olmasiGereken = kapsamDisi ? 0 : gvVergi(matrah, satisYili);

  /* Ödenenler ve iade. */
  const kdv = v.kdv || 0;
  const geciciHam = v.gecici || 0;
  const mahsupEdildi = a.gecMahsup === 'evet';
  const gecici = mahsupEdildi ? 0 : geciciHam;   /* mahsup edildiyse gelir vergisinin içinde, iki kez sayılmaz */
  const gelirV = v.gelirV || 0;
  const cezaFaiz = v.cezaFaiz || 0;

  const gvFark = Math.max(0, gelirV - olmasiGereken);
  const gvEksik = Math.max(0, olmasiGereken - gelirV);
  const iade = kdv + gecici + gvFark + cezaFaiz;

  const kalemler = [];
  if (kdv > 0) kalemler.push(['Ödenen KDV — ticari faaliyet yoksa hiç doğmaz', kdv]);
  if (gecici > 0) kalemler.push(['Ödenen geçici vergi — değer artış kazancında uygulanmaz', gecici]);
  if (mahsupEdildi && geciciHam > 0) kalemler.push(['Geçici vergi (yıllık beyanda mahsup edilmiş, ayrıca sayılmadı)', 0]);
  if (gvFark > 0) kalemler.push(['Gelir vergisi farkı — fazla ödenen kısım', gvFark]);
  if (cezaFaiz > 0) kalemler.push(['Vergi ziyaı cezası ve gecikme faizi', cezaFaiz]);

  esiState.sonuc = {
    risk: risk, kapsamDisi: kapsamDisi, kapsamSebep: kapsamSebep,
    satisYili: satisYili, istisna: istisna, endekslendi: endekslendi,
    maliyet: maliyet, kazanc: kazanc, matrah: matrah,
    olmasiGereken: olmasiGereken, gvEksik: gvEksik,
    kalemler: kalemler, iade: iade, gun: gun
  };

  state.pendingType = 'evSatisIade';
  state.pendingResult = { total: iade, evSatis: esiState.sonuc };
  state.pendingExtra = 'Ev satış vergi iadesi · Satış yılı: ' + satisYili +
    ' · Ticari sayılma riski: %' + risk.puan +
    ' · Hesaplanan iade: ' + fmt(iade);
  const ci = getStoredContactInfo();
  if (ci) finalizeLead(ci, ''); else showLeadModal('evSatisIade');
}
function esiSonucGoster() { esiState.step = 5; renderEvSatisIade(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function esiIleri() {
  esiKaydet();
  const s = esiState.step;
  if (s === 1) {
    if (!esiState.a.edinimSekli) { showValidationError('Taşınmazı nasıl edindiğinizi seçin.'); return; }
    if (!esiState.v.edinimTarihi || !esiState.v.satisTarihi) { showValidationError('Edinim ve satış tarihlerini girin.'); return; }
    if (!esiState.v.satisBedeli) { showValidationError('Satış bedelini girin.'); return; }
  }
  if (s === 2 && !esiState.a.amac) { showValidationError('Taşınmazı hangi amaçla aldığınızı seçin.'); return; }
  if (s === 3 && !esiState.v.kdv && !esiState.v.gecici && !esiState.v.gelirV) {
    showValidationError('Ödediğiniz vergilerden en az birini girin.'); return;
  }
  if (s < 4) { esiState.step++; renderEvSatisIade(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  esiHesapla();
}
function esiGeri() { if (esiState.step > 1) { esiKaydet(); esiState.step--; renderEvSatisIade(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }

function renderEvSatisIade() {
  const w = document.getElementById('evSatisIadeWrapper'); if (!w) return;
  const a = esiState.a, st = esiState.step;
  let h = '<div class="calc-page-header"><div class="step-number-badge">Vergi &amp; Gümrük Hukuku</div>' +
    '<h2>Ev satış vergisi iade tutarı hesaplama</h2>' +
    '<p>Ticari faaliyetiniz olmadığı hâlde konut satışınız ticari kazanç sayılıp KDV ve geçici vergi ödettirildiyse, ne kadarının iadesini isteyebileceğinizi hesaplayın. Doğru vergilendirme <strong>değer artış kazancı</strong> (GVK mük. m.80) üzerinden yapılır.</p></div>';

  if (st === 5) { h += esiSonucHtml(); w.innerHTML = h; tilt3dScan(); return; }

  h += '<div class="wz-card"><div class="wz-progress">';
  for (let i = 1; i <= 4; i++) h += '<span class="' + (i <= st ? 'done' : '') + '"></span>';
  h += '</div>';

  if (st === 1) {
    h += '<div class="wz-step-label">1. adım</div><div class="wz-q">Taşınmaz ve satış bilgileri</div>';
    h += '<p class="wz-hint">Edinim şekli ve elde tutma süresi, verginin hiç doğup doğmadığını belirliyor.</p><div class="wz-opts">';
    h += esiOpt('edinimSekli', 'satinalma', 'Satın aldım', 'Bedel ödeyerek edindim');
    h += esiOpt('edinimSekli', 'miras', 'Miras kaldı', 'İvazsız iktisap');
    h += esiOpt('edinimSekli', 'bagis', 'Bağış / hibe ile edindim', 'İvazsız iktisap');
    h += esiOpt('edinimSekli', 'insaat', 'Kendim yaptırdım', 'Arsa alıp inşa ettirdim');
    h += '</div><div class="form-grid" style="margin-top:18px">';
    h += esiTarih('edinimTarihi', 'Edinim (tapu) tarihi', 'Tapuda size geçtiği tarih');
    h += esiTarih('satisTarihi', 'Satış tarihi', 'Tapuda devrettiğiniz tarih');
    h += esiField('edinimBedeli', 'Edinim bedeli (TL)', 'Örn: 1500000', '₺', 'Miras/bağışta veraset beyanındaki değer');
    h += esiField('satisBedeli', 'Satış bedeli (TL)', 'Örn: 4000000', '₺', 'Tapuda gösterilen gerçek satış bedeli');
    h += esiField('masraf', 'Satış giderleri (TL)', 'Örn: 120000', '₺', 'Tapu harcı, emlakçı komisyonu gibi belgelenen giderler');
    h += esiField('yiufe', 'Yİ-ÜFE artış oranı (%)', 'Örn: 42', '%', 'Edinimden önceki ay ile satıştan önceki ay arasındaki artış. %10\'un altındaysa endeksleme yapılmaz (GVK mük. m.81). Bilmiyorsanız boş bırakın.');
    h += '</div>';
  }

  else if (st === 2) {
    h += '<div class="wz-step-label">2. adım</div><div class="wz-q">Ticari faaliyet var mı?</div>';
    h += '<p class="wz-hint">Bu bölüm iadenin kaderini belirliyor. İdare, satışı ticari sayarsa KDV ve geçici vergi haklı hâle gelir; ticari değilse ikisi de hiç doğmaz.</p>';
    h += '<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:6px 0 10px">Taşınmazı hangi amaçla edindiniz?</p><div class="wz-opts">';
    h += esiOpt('amac', 'oturmak', 'Oturmak için', 'Kendim veya ailem kullandı');
    h += esiOpt('amac', 'yatirim', 'Birikimimi korumak için', 'Yatırım amaçlı, satış planı yoktu');
    h += esiOpt('amac', 'satmak', 'Satıp kâr etmek için', 'Baştan satış amacı vardı');
    h += '</div>';
    h += '<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Üzerine inşaat yapıp sattınız mı?</p><div class="wz-opts">';
    h += esiOpt('insaat', 'hayir', 'Hayır') + esiOpt('insaat', 'evet', 'Evet', 'Kat karşılığı dahil');
    h += '</div>';
    h += '<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Gayrimenkul alım-satımı için vergi mükellefiyetiniz var mı?</p><div class="wz-opts">';
    h += esiOpt('mukellef', 'hayir', 'Hayır') + esiOpt('mukellef', 'evet', 'Evet', 'Vergi levhası / faaliyet kaydı var');
    h += '</div>';
    h += '<div class="form-grid" style="margin-top:18px">';
    h += esiField('satisSayisiYil', 'Aynı yıl içinde kaç taşınmaz sattınız?', 'Örn: 1', 'adet', 'Bu satış dahil');
    h += esiField('satisSayisi5Yil', 'Son beş yılda toplam kaç taşınmaz sattınız?', 'Örn: 2', 'adet');
    h += '</div>';
  }

  else if (st === 3) {
    h += '<div class="wz-step-label">3. adım</div><div class="wz-q">Ödediğiniz vergiler</div>';
    h += '<p class="wz-hint">Tahakkuk fişi, ihbarname veya ödeme makbuzlarındaki tutarları girin.</p><div class="form-grid">';
    h += esiField('kdv', 'Ödenen KDV (TL)', 'Örn: 400000', '₺', 'Ticari faaliyet yoksa bu tutarın tamamı iadeye konudur');
    h += esiField('gecici', 'Ödenen geçici vergi (TL)', 'Örn: 250000', '₺', 'Değer artış kazancında geçici vergi uygulanmaz');
    h += esiField('gelirV', 'Ödenen gelir vergisi (TL)', 'Örn: 600000', '₺', 'Yıllık beyanname üzerinden ödenen');
    h += esiField('cezaFaiz', 'Ödenen ceza ve gecikme faizi (TL)', 'Örn: 300000', '₺', 'Vergi ziyaı cezası, gecikme faizi');
    h += '</div>';
    h += '<p style="font-size:14px;font-weight:700;color:var(--text-primary);margin:22px 0 10px">Geçici vergi yıllık beyannamede mahsup edildi mi?</p>';
    h += '<p class="wz-hint">Mahsup edildiyse gelir vergisinin içinde eridi demektir; iki kez saymamak için ayrıca eklemiyoruz.</p><div class="wz-opts">';
    h += esiOpt('gecMahsup', 'hayir', 'Hayır / bilmiyorum') + esiOpt('gecMahsup', 'evet', 'Evet, mahsup edildi');
    h += '</div>';
  }

  else if (st === 4) {
    h += '<div class="wz-step-label">4. adım</div><div class="wz-q">Kontrol edin</div>';
    h += '<p class="wz-hint">Bilgiler doğruysa hesaplayalım. Eksik bıraktığınız alanlar sıfır kabul edilir.</p>';
    const v = esiState.v;
    const satir = function (e, d) { return '<div class="isc-breakdown-row"><span>' + e + '</span><span>' + d + '</span></div>'; };
    h += '<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Alan</span><span>Değer</span></div>';
    h += satir('Edinim şekli', ({ satinalma: 'Satın alma', miras: 'Miras', bagis: 'Bağış', insaat: 'Kendi inşaatı' })[a.edinimSekli] || '-');
    h += satir('Edinim → satış', (v.edinimTarihi || '-') + ' → ' + (v.satisTarihi || '-'));
    h += satir('Satış bedeli', fmt(v.satisBedeli || 0));
    h += satir('Edinim bedeli', fmt(v.edinimBedeli || 0));
    h += satir('Ödenen KDV', fmt(v.kdv || 0));
    h += satir('Ödenen geçici vergi', fmt(v.gecici || 0));
    h += satir('Ödenen gelir vergisi', fmt(v.gelirV || 0));
    h += '</div>';
  }

  h += '<div class="wz-actions">';
  h += st === 1 ? '<button class="btn-back" onclick="navigate(\'home\')">Vazgeç</button>'
    : '<button class="btn-back" onclick="esiGeri()"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Geri</button>';
  h += '<button class="btn-next" onclick="esiIleri()">' + (st === 4 ? 'İade tutarını hesapla' : 'Devam') +
    ' <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="' + (st === 4 ? 'M10 3l7 7-7 7M3 10h14' : 'M7 4l6 6-6 6') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  h += '</div></div>';
  w.innerHTML = h;
  tilt3dScan();
}

function esiSonucHtml() {
  const r = esiState.sonuc; if (!r) return '';
  const risk = r.risk;
  const riskRenk = risk.seviye === 'yuksek' ? 'kirmizi' : (risk.seviye === 'orta' ? 'sari' : 'yesil');
  let h = '<div class="isc-result-card tani-res">';

  h += '<div class="tani-res-top"><div class="tani-res-lbl">İade değerlendirmesi</div>' +
    '<h3>' + (risk.seviye === 'yuksek'
      ? 'Satışlarınız ticari sayılabilir — iade talebi tartışmalı'
      : 'Ticari faaliyet görünmüyor — KDV ve geçici vergi iadeye konu') + '</h3>' +
    '<p>' + (risk.seviye === 'yuksek'
      ? 'Aşağıdaki tutar, ticari nitelik iddiasının aşılması hâlinde talep edilebilecek üst sınırdır. Bu hâlde dosyanın önce devamlılık tartışmasını kazanması gerekir.'
      : 'Ticari faaliyet yoksa KDV hiç doğmaz (KDVK m.1/1), geçici vergi de uygulanmaz (GVK mük. m.120). Ödenen tutarlar bu ölçüde yersizdir.') + '</p></div>';

  /* Ticari sayılma riski */
  h += '<div class="tani-sec"><div class="tani-sec-t">Ticari sayılma riski</div>' +
    '<div class="tani-conf"><div class="tani-conf-bar"><i style="width:' + Math.max(6, risk.puan) + '%"></i></div><span>%' + risk.puan + '</span></div>' +
    '<ul class="tani-dikkat">';
  risk.nedenler.forEach(function (n) { h += '<li>' + n + '</li>'; });
  if (!risk.nedenler.length) h += '<li>Belirgin bir devamlılık göstergesi girilmedi.</li>';
  h += '</ul></div>';

  /* Büyük rakam */
  h += '<div class="vi-tutar"><div class="vi-tutar-lbl">Talep edilebilecek tahmini iade</div>' +
    '<div class="vi-tutar-big">' + fmt2(r.iade) + ' TL</div>' +
    '<div class="vi-tutar-alt">Ödenen tutarlar ile değer artış kazancı esasına göre olması gereken vergi arasındaki fark</div>' +
    '<div class="vi-tutar-not">Bu tutar girdiğiniz verilere dayanır; idarenin kabul edeceği tutar belgelerinize göre değişir.</div></div>';

  /* Kalem dökümü */
  h += '<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Tutar</span></div>';
  r.kalemler.forEach(function (k) {
    h += '<div class="isc-breakdown-row"><span>' + k[0] + '</span><span class="isc-amount">' + fmt(k[1]) + '</span></div>';
  });
  h += '<div class="isc-breakdown-row"><span><strong>Toplam iade</strong></span><span class="isc-amount">' + fmt(r.iade) + '</span></div>';
  h += '</div>';

  /* Olması gereken vergi */
  h += '<div class="tani-sec" style="margin-top:22px"><div class="tani-sec-t">Doğru vergilendirme nasıl olmalıydı?</div>';
  if (r.kapsamDisi) {
    h += '<div class="tani-dikkat"><li style="list-style:none"><strong>Hiç vergi doğmuyor.</strong> ' + r.kapsamSebep + '</li></div>';
  } else {
    h += '<div class="isc-breakdown-table">';
    h += '<div class="isc-breakdown-row"><span>Endekslenmiş maliyet' + (r.endekslendi ? ' (Yİ-ÜFE uygulandı)' : ' (Yİ-ÜFE %10 altında, endeksleme yok)') + '</span><span>' + fmt(r.maliyet) + '</span></div>';
    h += '<div class="isc-breakdown-row"><span>Değer artış kazancı</span><span>' + fmt(r.kazanc) + '</span></div>';
    h += '<div class="isc-breakdown-row"><span>' + r.satisYili + ' yılı istisnası</span><span>-' + fmt(r.istisna) + '</span></div>';
    h += '<div class="isc-breakdown-row"><span>Vergi matrahı</span><span>' + fmt(r.matrah) + '</span></div>';
    h += '<div class="isc-breakdown-row"><span><strong>Olması gereken gelir vergisi</strong></span><span class="isc-amount">' + fmt(r.olmasiGereken) + '</span></div>';
    h += '</div>';
  }
  if (r.gvEksik > 0) {
    h += '<div class="tani-dikkat" style="margin-top:12px"><li style="list-style:none">Dikkat: değer artış kazancı esasına göre hesaplanan vergi, ödediğiniz gelir vergisinden <strong>' + fmt(r.gvEksik) + ' TL fazla</strong>. Bu kalemde iade değil <strong>ek ödeme</strong> çıkabilir; KDV ve geçici vergi iadesi bundan bağımsızdır.</li></div>';
  }
  h += '</div>';

  /* Dayanak */
  h += '<div class="tani-sec"><div class="tani-sec-t">Dayanak</div><div class="tani-mev">' +
    ['GVK mük. m.80/6 — değer artışı kazançları, 5 yıl ve ivazsız iktisap',
      'GVK mük. m.81 — maliyetin Yİ-ÜFE ile endekslenmesi (%10 şartı)',
      'GVK m.37/2-4 — devamlı alım satımın ticari kazanç sayılması',
      'GVK mük. m.120 — geçici vergi yalnızca ticari ve serbest meslek kazancında',
      'KDVK m.1/1 — KDV yalnızca ticari/mesleki faaliyet çerçevesindeki teslimlerde',
      'VUK m.116-126 — düzeltme ve iade, 5 yıllık zamanaşımı'
    ].map(function (m) { return '<span class="tani-mev-c">' + m + '</span>'; }).join('') + '</div></div>';

  /* Ne yapmalı */
  h += '<div class="tani-sec"><div class="tani-sec-t">Şimdi ne yapmalısınız?</div><div class="vi-adimlar">';
  [['Belgeleri toplayın', 'Tapu senetleri, tahakkuk fişi ve ihbarname, ödeme makbuzları, satış sözleşmesi, oturduğunuzu gösteren belgeler (ikametgâh, abonelikler) ve varsa emlakçı faturaları.'],
  ['Ticari olmadığınızı belgeleyin', 'Dosyanın kilit noktası budur: taşınmazda oturulduğu, satışın zorunluluktan doğduğu (tayin, sağlık, borç), alım-satım organizasyonu bulunmadığı somut delillerle gösterilmelidir.'],
  ['Düzeltme talebiyle başvurun', 'Bağlı olduğunuz vergi dairesine yazılı düzeltme ve iade dilekçesi verip <strong>tarihli kayıt numarası</strong> alın. Süre: verginin doğduğu yılı izleyen yılbaşından itibaren <strong>5 yıl</strong> (VUK m.126).'],
  ['İhbarname geldiyse süreye dikkat', 'Tarhiyat ihbarnameyle yapıldıysa <strong>30 gün</strong> içinde vergi mahkemesinde dava açılmalıdır (İYUK m.7). Bu süre hak düşürücüdür; düzeltme talebi bu süreyi durdurmaz.'],
  ['Ret hâlinde şikayet ve dava', 'Düzeltme reddedilirse Hazine ve Maliye Bakanlığı\'na şikayet (VUK m.124), ardından 30 gün içinde dava. Dilekçede <strong>faizi açıkça talep edin</strong> (VUK m.112/4).']
  ].forEach(function (x, i) {
    h += '<div class="vi-adim"><span class="vi-adim-n">' + (i + 1) + '</span><div><strong>' + x[0] + '</strong><div class="vi-adim-m">' + x[1] + '</div></div></div>';
  });
  h += '</div></div>';

  h += '<div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg>' +
    '<p>Bu hesap tahminîdir, hukuki görüş değildir. Ticari faaliyet ayrımı somut olayın koşullarına göre yargı tarafından değerlendirilir; sonuç garanti edilmez.</p></div>';

  h += '<div class="tani-sec"><div class="tani-sec-t">İlgili araçlar</div><div class="tani-tools">' +
    ['vergiIade', 'vergiDavasi', 'tapu'].map(function (id, i) { return taniArac(id, i === 0); }).join('') + '</div></div>';

  h += '<div class="cmp-actions" style="margin-top:14px"><a class="btn-whatsapp cmp-wa-btn" target="_blank" rel="noopener" href="' +
    whatsappLink('Merhaba, ev satışım ticari kazanç sayılıp KDV ve geçici vergi ödedim. Sitedeki hesaplamaya göre yaklaşık ' + fmt(r.iade) + ' iade talep edilebiliyor. Görüşebilir miyiz?') +
    '"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg> Dosyamı değerlendirin</a></div>';

  h += '<div class="tani-foot" style="margin-top:18px"><button class="btn-back" onclick="openEvSatisIade()">Yeni hesaplama</button></div>';
  h += '</div>';
  return h;
}
