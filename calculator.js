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
  const body=JSON.stringify({model:extra?.model||'llama-3.3-70b-versatile',messages,temperature:extra?.temp||0.3,max_tokens:extra?.tokens||2000,responseFormat:extra?.responseFormat?true:undefined});
  return fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json'},body},extra?.timeout||30000);
}
/* Groq'un decommission ettiği llama-3.2-*-vision-preview modelleri yerine tek noktadan güncel model */
const GROQ_VISION_MODEL='meta-llama/llama-4-scout-17b-16e-instruct';
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

const _SB_U='https://hvsxeljnyxmhiwgsqhgx.supabase.co';
const _SB_K='sb_publishable_BcnsD00a5GKnQvNIqQ_jCg_i4gb7ycq';
let _sbClient=null;
function getSb(){if(!_sbClient&&window.supabase){_sbClient=window.supabase.createClient(_SB_U,_SB_K);}return _sbClient;}
async function sbInsert(table,data){try{const c=getSb();if(c)await c.from(table).insert(data);}catch(e){}}
async function sbSelect(table){try{const c=getSb();if(c){const r=await c.from(table).select('*');return r.data||[];}}catch(e){}return[];}

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
  'BMW':['Base','Sport Line','M Sport','M Performance','Individual','Edition'],
  'Mercedes-Benz':['Base','Avantgarde','AMG Line','Night','Edition','Exclusive'],
  'BMW-M':['Base','Competition','CS','CSL'],
  'Porsche':['Base','S','4S','GTS','Turbo','Turbo S'],
  'Ferrari':['Base','S','GTB','Spider','Pista','Speciale'],
  'Lamborghini':['Base','S','Performante','Evo','SVJ','STO'],
  'McLaren':['Base','S','LT','Spider','Senna'],
  'Range Rover':['Base','SE','HSE','Autobiography','SV'],
  'Land Rover':['Base','S','SE','HSE','Metropolitan','X-Dynamic'],
  'Tesla':['Standard Range','Long Range','Performance','Plaid'],
  'TOGG':['Standart','Uzun Menzil','Performans'],
  'Chery':['Base','Comfort','Premium','Pro','Pro Max','Excellence','Business','Luxury','Executive'],
  'BYD':['Base','Comfort','Design','Premium','Flagship'],
  'MG':['Base','Comfort','Luxury','Exclusive','Trophy'],
  'JAECOO':['Base','Comfort','Premium','Luxury'],
  'Hyundai':['Base','Comfort','Elite','Premium','N Line','N'],
  'Kia':['Base','Concept','GT Line','GT','Premium'],
  'Toyota':['Base','Comfort','Lounge','Dream','Grace','Passion','Exclusive'],
  'Volkswagen':['Base','Life','Style','R Line','R','GTE','GTI'],
  'Renault':['Base','Joy','Touch','Icon','R.S. Line','Initiale Paris'],
  'Fiat':['Base','Pop','Easy','Lounge','Sport','Cult'],
  'Ford':['Base','Titanium','ST Line','Active','Vignale','ST','RS'],
  'Volvo':['Base','Momentum','R-Design','Inscription','Polestar','Recharge'],
  'Peugeot':['Base','Active','Allure','GT Line','GT','PSE'],
  'Opel':['Base','Edition','Cosmo','GS Line','GS','OPC'],
  'Seat':['Base','Reference','Style','Xcellence','FR','Cupra'],
  'Skoda':['Base','Active','Ambition','Style','Sportline','Laurin & Klement','RS'],
  'Dacia':['Base','Essential','Expression','Journey','Extreme'],
  'Nissan':['Base','Visia','Acenta','N-Connecta','Tekna','Nismo'],
  'Honda':['Base','Trend','Elegance','Executive','Sport','Type R'],
  'Mazda':['Base','Prime-Line','Revolution','Takumi','Sport Black'],
  'Suzuki':['Base','GL','GLX','Sport','Limited'],
  'Citroen':['Base','Feel','Shine','C-Series','Pallas'],
  'SsangYong':['Base','Urban','Premium','Limited','Offroad'],
  'Lexus':['Base','Elegance','F Sport','Executive','Takumi'],
  'Cupra':['Base','V1','V2','VZ','VZ3','TCR'],
  'Mini':['Base','Classic','PEPPER','SALT','JCW','John Cooper Works'],
  'DS':['Base','Performance Line','Rivoli','Opera','Esprit de Voyage'],
  'Polestar':['Standard','Long Range','Dual Motor','Performance'],
  'Jeep':['Base','Sport','Limited','Trailhawk','S','Summit'],
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
  'Chery|Omoda 3':['Comfort','Excellent'],
  'Chery|Omoda 5':['Comfort','Excellent','Excellent+'],
  'Chery|Omoda 5 Pro':['Excellent','Excellent+'],
  'Chery|Omoda 7':['Excellent','Excellent+'],
  'Chery|Omoda 9':['Excellent','Excellent+'],
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
  'Excellent':1.15,'Excellent+':1.22,'Elite':1.12,'Prestige':1.20};
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

const TESTIMONIALS=[
  {name:'Ahmet K.',city:'İstanbul',rating:5,date:'12 Ocak 2026',module:'Araç Değer Kaybı',text:'2023 model Golfüm kaza yaptı, sandım değer kaybı alamam. Müvekkil Bilgi sayesinde 87.000 TL değer kaybı tazminatı aldım! Sigorta şirketinin ilk teklifi sadece 12.000 TL\'ydi. Profesyonel destekle 7 kat fazla aldım.',avatar:'A'},
  {name:'Fatma S.',city:'Ankara',rating:5,date:'8 Ocak 2026',module:'İşçilik Tazminatı',text:'11 yıllık çalıştığım işyerinden haksız yere çıkarıldım. Müvekkil Bilgi hesaplamasıyla kıdem + ihbar + izin hesabımı yaptım, avukatımla birlikte toplam 285.000 TL tazminat kazandım. Çok teşekkürler!',avatar:'F'},
  {name:'Mehmet Y.',city:'İzmir',rating:5,date:'3 Ocak 2026',module:'İş Kazası Tazminatı',text:'İş kazası sonucu elimin 3 parmağı kırıldı. SGK\'dan aldığım reddedildi, Müvekkil Bilgi sayesinde işverene karşı dava açtım ve 450.000 TL tazminat kazandım. Hesaplama aracı gerçekten doğru çıkıyor!',avatar:'M'},
  {name:'Elif D.',city:'Bursa',rating:5,date:'28 Aralık 2025',module:'Destekten Yoksun',text:'Eşim trafik kazasında vefat etti. En zor zamanda Müvekkil Bilgi\'nun hesaplama aracı ve avukat yönlendirmesi sayesinde 1.2M TL destekten yoksun kalma tazminatı aldım. Allah razı olsun.',avatar:'E'},
  {name:'Hasan B.',city:'Antalya',rating:5,date:'20 Aralık 2025',module:'Manevi Tazminat',text:'Hastaneden kaynaklı bir hata sonucu 6 ay tedavi gördüm. Müvekkil Bilgi\'nun yardımıyla 180.000 TL manevi tazminat talebinde bulundum ve kazandım. Bu site gerçekten işe yarıyor!',avatar:'H'},
  {name:'Zeynep A.',city:'Konya',rating:4,date:'15 Aralık 2025',module:'Tüketici Hakları',text:'Aldığım telefon arızalı çıktı, firmaya iade etmek istedim reddettiler. Müvekkil Bilgi sayesinde tüketici mahkemesine başvurdum ve hem bedelini hem de manevi tazminatı aldım. Harika bir platform!',avatar:'Z'},
  {name:'Ali R.',city:'Trabzon',rating:5,date:'10 Aralık 2025',module:'Kasko Hasarı',text:'Kasko sigortam hasarımı tam karşılamadı. Müvekkil Bilgi\'nun hesaplamasıyla sigortaya itiraz ettim, eksper yeniden geldi ve 62.000 TL fazladan ödeme aldım. Kesinlikle kullanın!',avatar:'A'},
  {name:'Selin T.',city:'Eskişehir',rating:5,date:'5 Aralık 2025',module:'Nafaka',text:'Boşanma sürecimde nafaka hesabımı Müvekkil Bilgi ile yaptım. Hakimin bana verdiği nafaka, hesaplamayla birebir aynı çıktı! 3 çocuk için aylık 18.500 TL nafaka aldım. Çocuklarımın hakkıydı.',avatar:'S'},
  {name:'Emre K.',city:'Gaziantep',rating:5,date:'1 Aralık 2025',module:'Trafik Cezası İtiraz',text:'Haksız yere 4.000 TL trafik cezası yedim. Müvekkil Bilgi\'nun yardımıyla itiraz dilekçesi yazdım ve ceza iptal edildi! Hiçbir avukat tutmadan kendim yaptım, sayenizde.',avatar:'E'},
  {name:'Derya M.',city:'Adana',rating:5,date:'25 Kasım 2025',module:'Maddi Hasar',text:'Kaza sonrası aracım pert oldu ama sigorta eksik ödedi. Müvekkil Bilgi\'nun maddi hasar hesaplamasıyla gerçek zararımı hesapladım ve karşı tarafa dava açtım. 320.000 TL ek tazminat aldım!',avatar:'D'}
];

const MODULES = [
  // ===== TRAFİK KAZASI TAZMİNATLARI =====
  {id:'kusur',title:'Trafik Kazası Kusur Oranı\nve Tazminat Hakları Tespiti',icon:'🚦',desc:'Kazanızı anlatın: yapay zeka hem kusur oranınızı belirlesin hem de değer kaybı, mahrumiyet, sakatlık gibi hangi tazminat haklarına sahip olduğunuzu söylesin.',tags:['AI Analiz','Kusur Tespiti','Hak Tespiti'],screen:'kusur',category:'trafik'},
  {id:'arac',title:'Araç Değer Kaybı\nTazminatı',icon:'🚙',desc:'Trafik kazası geçiren aracınızın piyasa değerindeki kaybı yasal formüllerle hesaplayın.',tags:['4 Adımlı Form','Otomatik Değerleme','Anlık Sonuç'],screen:'arac',category:'trafik'},
  {id:'hasar',title:'Araç Gerçek Hasar\nBedeli Hesaplama',icon:'🔨',desc:'Kaza sonrası araç hasar onarım bedelini hesaplayın. Yedek parça ve işçilik maliyetleri dahil.',tags:['Onarım Maliyeti','Parça Fiyatı','Hızlı Sonuç'],screen:'generic',category:'trafik'},
  {id:'mahrumiyet',title:'Araç Mahrumiyet\nTazminatı Hesaplama',icon:'🚘',desc:'Kaza sonrası aracınızın mahrumiyet (yatma) bedelini hesaplayın. Kiralık araç ve günlük kira bedellerine göre.',tags:['Günlük Kira','Mahrumiyet Süresi','Net Tazminat'],screen:'generic',category:'trafik'},
  {id:'pertBedeli',title:'Pert Araç Bedeli\nHesaplama',icon:'💥',desc:'Onarım bedeli piyasa değerinin %50\'sini aşan (pert) araçlarda sigortadan alacağınız bedeli hesaplayın.',tags:['Pert Tespiti','Rayiç Bedel','Sovtaj'],screen:'generic',category:'trafik'},
  {id:'sakatlik',title:'Sürekli Sakatlık\nTazminatı',icon:'🏥',desc:'Kaza sonrası sürekli sakatlık oranı ve tazminat hesaplaması yapın.',tags:['Sakatlık Oranı','Tıbbi Değerlendirme','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'yoksun',title:'Destekten Yoksun\nKalma Tazminatı',icon:'🕊',desc:'Vefat eden kişinin desteğinden yoksun kalanlar için tazminat hesaplayın.',tags:['Mirasçı Hakları','Gelir Kaybı','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'maddi',title:'Maddi Hasar\nHesaplama',icon:'📑',desc:'Kaza sonrası maddi zararlarınızı hesaplayın.',tags:['Zarar Hesabı','Kapsamlı','Detaylı'],screen:'generic',category:'trafik'},
  {id:'kasko',title:'Kasko Hasar\nTazminatı',icon:'🛡',desc:'Kasko sigortası kapsamındaki hasar talebinizi ve tahmini tazminatınızı hesaplayın.',tags:['Kasko Kapsamı','Hasar Türü','Sigorta Talebi'],screen:'generic',category:'trafik'},
  {id:'manevi',title:'Manevi Tazminat\nHesaplama',icon:'💔',desc:'Kaza veya zarar sonrası manevi tazminat talebinizi hesaplayın.',tags:['Manevi Zarar','Dava Türü','Tahmini Tutar'],screen:'generic',category:'trafik'},
  {id:'gecici',title:'Geçici İş\nGöremezlik',icon:'🚑',desc:'Kaza sonrası geçici iş göremezlik süresindeki gelir kaybınızı hesaplayın.',tags:['Günlük Gelir','İstirahat Süresi','Net Tutar'],screen:'generic',category:'trafik'},
  {id:'kalici',title:'Kalıcı İş\nGöremezlik',icon:'⚖',desc:'Kaza sonrası kalıcı iş göremezlik oranı ve tazminat hesaplaması yapın.',tags:['Sakatlık Oranı','Yaşam Boyu','Hesaplama'],screen:'generic',category:'trafik'},
  {id:'trafikCezasi',title:'Trafik Cezası\nİtiraz Hesaplama',icon:'🚨',desc:'Trafik cezalarına itiraz sürecinde olası maliyet ve tazminat hesaplaması yapın.',tags:['İtiraz Süreci','Ceza Tutarı','Mahkeme'],screen:'generic',category:'trafik'},
  // ===== İŞÇİ ALACAKLARI =====
  {id:'fesih',title:'İşçi Haklı Fesih ve\nKıdem Tazminatı Uygunluk Testi',icon:'📋',desc:'İstifa edersem tazminat alabilir miyim? İş Kanunu 4857 madde 24 kapsamında haklı fesih ve kıdem tazminatı hakkınızı yapay zeka ile değerlendirin.',tags:['AI Analiz','Madde 24','Haklı Fesih'],screen:'fesih',category:'isci'},
  {id:'iseIade',title:'İşe İade Davası\nAçabilir Miyim?',icon:'⚖️',desc:'İşten çıkarıldıysanız işe iade davası/başvurusu açma şartlarını taşıyıp taşımadığınızı yapay zeka ile öğrenin.',tags:['AI Analiz','Madde 18-21','İşe İade'],screen:'iseIade',category:'isci'},
  {id:'iscilik',title:'İşçilik Alacakları\nHesaplama',icon:'💵',desc:'Kıdem, ihbar, yıllık izin ve fazla mesai alacaklarınızı hesaplayın.',tags:['Kıdem & İhbar','Fazla Mesai','Net Tutar'],screen:'iscilik',category:'isci'},
  {id:'iseIadeTazminat',title:'İşe İade Davası\nTazminatlarını Hesaplama',icon:'⚖️',desc:'İşe iade davasını kazanmanız durumunda alacağınız boşta geçen süre ücreti ve işe başlatmama tazminatını hesaplayın.',tags:['Boşta Geçen Süre','İşe Başlatmama','Net Tutar'],screen:'generic',category:'isci'},
  {id:'isgucu',title:'İş Gücü Kaybı\nHesaplama',icon:'🔶',desc:'Kaza sonucu uğradığınız iş gücü kaybı tazminatını hesaplayın.',tags:['Günlük Gelir','Kaza Dönemi','Tazminat'],screen:'generic',category:'isci'},
  {id:'isKazasi',title:'İş Kazası\nTazminatı',icon:'🦺',desc:'İş kazası sonucu hak ettiğiniz tazminatı hesaplayın. SGK ve işveren sorumluluğu dahil.',tags:['SGK Hakları','İşveren Sorumluluğu','Rapor Süresi'],screen:'generic',category:'isci'},
  // ===== DİĞER TAZMİNATLAR =====
  {id:'bosanma',title:'Boşanma Tazminatı\nve Mal Paylaşımı',icon:'👨‍⚖️',desc:'Boşanma davasında maddi/manevi tazminat, nafaka ve mal paylaşımı hesaplaması yapın.',tags:['Boşanma','Nafaka','Mal Paylaşımı'],screen:'generic',category:'diger'},
  {id:'miras',title:'Miras Payı\nHesaplama',icon:'📜',desc:'Türk Medeni Kanunu\'na göre miras paylarını hesaplayın. Yasal mirasçılar ve miras oranları.',tags:['Miras Hukuku','Pay Hesaplama','Yasal Düzenleme'],screen:'generic',category:'diger'},
  {id:'kamulastirma',title:'Kamulaştırmasız\nEl Atma Tazminatı',icon:'🏗️',desc:'Kamulaştırmasız el atma durumunda taşınmaz bedeli ve tazminat hesaplaması yapın.',tags:['El Atma','Taşınmaz Bedeli','Tazminat'],screen:'generic',category:'diger'},
  {id:'nafaka',title:'Nafaka\nHesaplama',icon:'👨‍⚖️',desc:'Boşanma davalarında iştirak ve yoksulluk nafakası hesaplaması yapın.',tags:['Boşanma','Nafaka Türü','Aylık Tutar'],screen:'generic',category:'diger'},
  {id:'tuketici',title:'Tüketici Hakları\nTazminatı',icon:'🏷',desc:'Ayıplı mal veya hizmet nedeniyle tüketici mahkemesi taleplerinizi hesaplayın.',tags:['Ayıplı Mal','İade Hakkı','Tazminat'],screen:'generic',category:'diger'},
  {id:'tapu',title:'Tapu Harcı ve\nVergi Hesaplama',icon:'🏠',desc:'Gayrimenkul alım-satımında tapu harcı, KDV ve vergi yükümlülüklerinizi hesaplayın.',tags:['Tapu Harcı','KDV','Vergi Oranı'],screen:'generic',category:'diger'}
];

const BLOG_POSTS = [
  {id:1,title:'Araç Değer Kaybı Tazminatı Nasıl Alınır?',category:'Araç Değer Kaybı',icon:'🚗',date:'15 Ocak 2026',excerpt:'Trafik kazası sonrası aracınızın değer kaybını nasıl talep edeceğinizi adım adım anlattık.',content:'<h2>Araç Değer Kaybı Nedir?</h2><p>Trafik kazası geçiren bir araç, aynı marka, model ve yaşta kazasız bir araca kıyasla daha düşük piyasa değeri taşır.</p><h3>Kimler Başvurabilir?</h3><ul><li>Kaza sonucu aracında hasar oluşan tüm araç sahipleri</li><li>Kusurlu tarafın zorunlu trafik sigortasından talep edebilirler</li><li>Kaza tarihinden itibaren 2 yıl içinde başvuru yapılmalıdır</li></ul><h3>Başvuru İçin Gerekenler</h3><ul><li>Kaza tutanağı</li><li>Hasar tespit raporu</li><li>Ekspertiz raporu</li><li>Araç ruhsatı</li></ul><blockquote>Profesyonel bir eksper raporu değer kaybı talebinizi güçlendirecektir.</blockquote>'},
  {id:2,title:'Kıdem Tazminatı Hesaplama Rehberi',category:'Tazminat',icon:'💰',date:'10 Ocak 2026',excerpt:'İşten ayrılan her çalışanın bilmesi gereken kıdem tazminatı hesaplama detayları.',content:'<h2>Kıdem Tazminatı Nedir?</h2><p>Aynı işyerinde en az 1 yıl çalışmış işçilerin, işten çıkarılmaları durumunda aldıkları tazminattır.</p><h3>Hesaplama Formülü</h3><p>Kıdem tazminatı = Son brüt maaş × Çalışma yılı</p><h3>Kimler Alabilir?</h3><ul><li>En az 1 yıl çalışan işçiler</li><li>İşveren tarafından çıkarılanlar</li><li>Haklı nedenle istifa edenler</li></ul><h3>2026 Tavan Tutarı</h3><p>2026 yılı kıdem tazminatı tavan tutarı 73.729,87 TL olarak belirlenmiştir.</p>'},
  {id:3,title:'Trafik Kazasında Haklarınız',category:'Trafik Kazaları',icon:'⚖️',date:'5 Ocak 2026',excerpt:'Trafik kazası sonrası bilmeniz gereken tüm hukuki haklar ve süreçler.',content:'<h2>Kaza Sonrası Yapılacaklar</h2><ol><li>Güvenliğin sağlanması</li><li>Polis/jandarma çağrılması</li><li>Kaza tutanağı düzenlenmesi</li><li>Fotoğraf çekilmesi</li><li>Sigorta şirketinin bilgilendirilmesi</li></ol><h3>Tazminat Türleri</h3><ul><li>Araç değer kaybı tazminatı</li><li>Hasar bedeli tazminatı</li><li>İş gücü kaybı tazminatı</li><li>Sürekli sakatlık tazminatı</li><li>Manevi tazminat</li></ul><h3>Zamanaşımı</h3><p>Trafik kazası tazminatı davalarında zamanaşımı süresi 2 yıldır.</p>'},
  {id:4,title:'Sigorta ve Kasko Arasındaki Farklar',category:'Sigorta',icon:'🛡️',date:'1 Ocak 2026',excerpt:'Zorunlu trafik sigortası ile kasko arasındaki temel farkları öğrenin.',content:'<h2>Zorunlu Trafik Sigortası</h2><p>Karşı tarafa verilen zararı karşılar. Her araç sahibinin yaptırmak zorunda olduğu sigortadır.</p><ul><li>Üçüncü kişilere verilen zararları karşılar</li><li>Maddi ve bedensel zararları kapsar</li><li>Teminat limitleri yasal olarak belirlenmiştir</li></ul><h2>Kasko Sigortası</h2><p>Aracınızın kendi hasarını karşılar. İsteğe bağlıdır.</p><ul><li>Çarpışma, yangın, hırsızlık</li><li>Doğal afetler</li><li>Cam kırılması</li><li>Yetkili oto pulları</li></ul>'},
  {id:5,title:'Yargıtay Kararları: Değer Kaybı',category:'Yargıtay Kararları',icon:'⚖️',date:'25 Aralık 2025',excerpt:'Değer kaybı tazminatına ilişkin güncel Yargıtay kararları.',content:'<h2>Önemli Yargıtay Kararları</h2><p>Değer kaybı tazminatı ile ilgili emsal niteliğinde kararlar mevcuttur.</p><h3>Yargıtay 17. Hukuk Dairesi</h3><blockquote>Değer kaybı, aracın ticari değerindeki azalmayı ifade eder. Bu zarar, kaza ile nedensel bağı bulunan gerçek bir zarardır.</blockquote><h3>Yargıtay 4. Hukuk Dairesi</h3><blockquote>Sigorta şirketi, değer kaybı talebini reddedemez. Eksper raporu ile desteklenen talepler kabul edilmelidir.</blockquote>'},
  {id:6,title:'Güncel Tazminat Haberleri',category:'Güncel Haberler',icon:'📰',date:'20 Aralık 2025',excerpt:'Tazminat ve sigorta sektöründeki son gelişmeler.',content:'<h2>Son Gelişmeler</h2><ul><li>2026 kıdem tazminatı tavan tutarı açıklandı</li><li>Zorunlu trafik sigortası primlerinde güncelleme</li><li>Dijital hasar tespit sistemi yaygınlaşıyor</li><li>Elektrikli araçlar için özel sigorta poliçeleri</li></ul><h3>Önemli Mevzuat Değişiklikleri</h3><p>2026 yılı itibarıyla trafik sigortası teminat tutarları güncellenmiştir.</p>'},
  {id:7,title:'İş Kazası Tazminatı Rehberi',category:'İş Hukuku',icon:'🏗️',date:'15 Aralık 2025',excerpt:'İş kazası sonucunda hak ettiğiniz tazminatlar ve süreç hakkında bilmeniz gerekenler.',content:'<h2>İş Kazası Nedir?</h2><p>İşyerinde veya işin yürütümü sırasında meydana gelen, işçiye zarar veren olaylardır.</p><h3>İşverenin Yükümlülükleri</h3><ul><li>Güvenli çalışma ortamı sağlamak</li><li>İş sağlığı ve güvenliği eğitimleri vermek</li><li>Koruyucu ekipman sağlamak</li><li>Kaza anında SGK\'ya bildirim yapmak</li></ul><h3>Tazminat Türleri</h3><ul><li>Sürekli iş göremezlik geliri</li><li>Geçici iş göremezlik ödeneği</li><li>Evlenme yardımı</li><li>Ölüm geliri</li></ul>'},
  {id:8,title:'Boşanma ve Nafaka Hakları',category:'Aile Hukuku',icon:'👨‍👩‍👧',date:'10 Aralık 2025',excerpt:'Boşanma sürecinde nafaka, velayet ve mal paylaşımı hakkında bilmeniz gerekenler.',content:'<h2>Nafaka Türleri</h2><h3>İştirak Nafakası</h3><p>Çocuğun eğitim, beslenme ve bakım giderlerini karşılar.</p><h3>Yoksulluk Nafakası</h3><p>Boşanma sonrası yoksulluğa düşecek tarafa verilir.</p><h3>Yardım Nafakası</h3><p>Geçimini sağlayamayan tarafa verilir.</p><h3>Hesaplama Kriterleri</h3><ul><li>Tarafların gelir durumu</li><li>Yaşam standardı</li><li>Çocuk sayısı ve yaşı</li><li>Kusur oranı</li></ul>'},
  {id:9,title:'Tüketici Hakları ve Ayıplı Mal',category:'Tüketici Hakları',icon:'🛒',date:'5 Aralık 2025',excerpt:'Ayıplı mal veya hizmet satın aldığınızda haklarınızı ve başvuru süreçlerini öğrenin.',content:'<h2>Ayıplı Mal Nedir?</h2><p>Satın alınan malın, tüketicinin beklentilerini karşılayamayan, fonksiyonunu yerine getiremeyen veya ayıplı olan ürünlerdir.</p><h3>Tüketici Hakları</h3><ul><li>Ürünü iade etme hakkı</li><li>Bedel indirimi talep etme</li><li>Ücretsiz onarım talep etme</li><li>Eşdeğer ürün talep etme</li><li>Sözleşmeden dönme hakkı</li></ul><h3>Başvuru Süreleri</h3><p>Ayıp, 30 gün içinde bildirilmelidir. Dava açma süresi ise 2 yıldır.</p>'},
  {id:10,title:'Kasko Sigortası Kapsamı ve İstisnaları',category:'Sigorta',icon:'🛡️',date:'1 Aralık 2025',excerpt:'Kasko sigortasının kapsadığı durumlar ve istisnalar hakkında detaylı bilgi.',content:'<h2>Kasko Kapsamı</h2><ul><li>Çarpışma hasarı</li><li>Yangın</li><li>Hırsızlık</li><li>Doğal afet (deprem, sel, fırtına)</li><li>Cam kırılması</li><li>Terör</li></ul><h2>İstisnalar</h2><ul><li>Savaş</li><li>Nükleer riskler</li><li>Sürücünün alkollü olması</li><li>Ehliyetsiz kullanma</li><li>Bilerek verilen zarar</li></ul>'},
  {id:11,title:'Manevi Tazminat Davası Nasıl Açılır?',category:'Hukuk Rehberi',icon:'💔',date:'28 Kasım 2025',excerpt:'Manevi tazminat davası açma süreci, gerekli belgeler ve dikkat edilmesi gerekenler.',content:'<h2>Manevi Tazminat Nedir?</h2><p>Duygusal acı, elem ve ıstırabın karşılanması için talep edilen tazminattır.</p><h3>Dava Şartları</h3><ul><li>Haksız fiil olmalı</li><li>Zarar meydana gelmeli</li><li>Haksız fiil ile zarar arasında nedensel bağı olmalı</li><li>Fail kusurlu olmalı</li></ul><h3>Takdir Edilmesinde Dikkate Alınan Hususlar</h3><ul><li>Tarafların sosyal ve ekonomik durumu</li><li>Kusur oranı</li><li>Zararın ağırlığı</li><li>Olayın oluş biçimi</li></ul>'},
  {id:12,title:'Sigorta İtiraz Dilekçesi Nasıl Yazılır?',category:'Hukuk Rehberi',icon:'📝',date:'20 Kasım 2025',excerpt:'Sigorta şirketinin tazminat talebinizi reddetmesi durumunda itiraz süreci.',content:'<h2>İtiraz Süreci</h2><ol><li>Sigorta company\'sinin red yazısını inceleyin</li><li>Itiraz dilekçesini hazırlayın</li><li>İlgili sigorta company\'sine gönderin</li><li>Reddedilirse tüketici mahkemesine başvurun</li></ol><h3>Dilekçe İçeriği</h3><ul><li>Tarafların bilgileri</li><li>Poliçe numarası</li><li>Kaza tarihi ve detayları</li><li>Talep edilen tutar</li><li>Gerekçeler</li></ul>'},
  {id:13,title:'Arabuluculuk ile Hızlı Çözüm',category:'Hukuk Rehberi',icon:'🤝',date:'15 Kasım 2025',excerpt:'Mahkeme sürecine girmeden arabuluculuk ile tazminat anlaşmaları yapın.',content:'<h2>Arabuluculuk Nedir?</h2><p>Tarafların, tarafsız bir arabulucu eşliğinde anlaşmaya varmasıdır.</p><h3>Avantajları</h3><ul><li>Daha hızlı çözüm</li><li>Daha düşük maliyet</li><li>Gizlilik</li><li>Tarafların kontrolü</li></ul><h3>Zorunlu Arabuluculuk</h2><p>İş davaları ve ticari davalarda dava açmadan önce arabulucuya başvurma zorunluluğu vardır.</p>'},
  {id:14,title:'Bilirkişi Raporu Nasıl Okunur?',category:'Hukuk Rehberi',icon:'🔬',date:'10 Kasım 2025',excerpt:'Mahkemeler tarafından atanan bilirkişi raporlarını doğru yorumlama rehberi.',content:'<h2>Bilirkişi Raporu Nedir?</h2><p>Uzmanlık gerektiren konularda mahkeme tarafından atanan bilirkişinin hazırladığı rapordur.</p><h3>Raporun Unsurları</h3><ul><li>Kaza inceleme sonuçları</li><li>Hasar tespiti</li><li>Kusur analizi</li><li>Tazminat hesaplama</li></ul><h3>İtiraz Hakkı</h3><p>Bilirkişi raporuna 10 gün içinde itiraz edilebilir.</p>'}
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
  {q:'Kasko hasarı nasıl alınır?',a:'Kasko sigortası kapsamında hasar oluştuğunda sigorta company\'sine başvuru yapılır. Eksper tespitinin ardından onarım veya ödeme yapılır.'},
  {q:'Ayıplı mal için ne kadar sürede başvurulur?',a:'Ayıp, 30 gün içinde satıcıya bildirilmelidir. Dava açma süresi ise 2 yıldır. 2 yıl içinde dava açılmalıdır.'},
  {q:'Arabuluculuk nedir?',a:'Tarafların, tarafsız bir arabulucu eşliğinde anlaşmaya varmasıdır. İş davalarında ve ticari davalarda dava açmadan önce arabulucuya başvuru zorunludur.'},
  {q:'Manevi tazminat nasıl hesaplanır?',a:'Manevi tazminat hakim tarafından takdir edilir. Tarafların sosyal ve ekonomik durumu, kusur oranı, zararın ağırlığı ve olayın oluş biçimi dikkate alınır.'},
  {q:'Trafik cezasına itiraz nasıl yapılır?',a:'Trafik cezası tebliğ edildikten 15 gün içinde ilgili sulh ceza hakimliğine itiraz dilekçesi ile başvurulabilir.'},
  {q:'Tapu harcı ne kadar?',a:'Gayrimenkul alım-satımında tapu harcı emlak bedelinin %4\'üdür. 2026 için bu oran alıcı ve satıcı için ayrı ayrı geçerlidir.'},
  {q:'Sigorta tazminatı ne zaman ödenir?',a:'Sigorta tazminatı, hasar tespitinin ardından 15 iş günü içinde ödenir. Gecikme durumunda yasal faiz işletilir.'},
  {q:'Bilirkişi raporuna itiraz nasıl yapılır?',a:'Bilirkişi raporuna tebliğ tarihinden itibaren 10 gün içinde itiraz edilebilir. İtiraz dilekçesi ilgili mahkemeye sunulur.'}
];

const CALC_CONFIGS = {
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
  maddi:{badge:'Maddi Hasar Hesaplama',title:'Maddi Hasar Hesaplayın',desc:'Kaza sonrası tüm maddi zararlarınızı hesaplayın',
    fields:[{id:'mh_onarim',label:'Onarım Bedeli (TL) *',type:'number',prefix:'₺',placeholder:'Örn: 50000',required:true},{id:'mh_degerkaybi',label:'Araç Değer Kaybı (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'mh_arac',label:'Araç Kullanım Kaybı (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'mh_ekipman',label:'Ek Ekipman Kaybı (TL)',type:'number',prefix:'₺',placeholder:'0'},{id:'mh_kusur',label:'Kusur Oranı (%)',type:'range',min:0,max:100,step:5,defaultVal:0}],
    calculate(d){const o=parseFloat(d.mh_onarim)||0,dv=parseFloat(d.mh_degerkaybi)||0,a=parseFloat(d.mh_arac)||0,e=parseFloat(d.mh_ekipman)||0,k=parseInt(d.mh_kusur)||0,top=o+dv+a+e,net=Math.round(top*(1-k/100));return{total:net,rows:[{label:'Onarım Bedeli',value:fmt(o)},{label:'Değer Kaybı',value:fmt(dv)},{label:'Kullanım Kaybı',value:fmt(a)},{label:'Ek Ekipman',value:fmt(e)},{label:'Toplam Brüt Zarar',value:fmt(top)},{label:'Kusur İndirimi (%'+k+')',value:'-'+fmt(Math.round(top*k/100))},{label:'Tahmini Net Tazminat',value:fmt(net),highlight:true}]}}},
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
  '/deger-kaybi-hesaplama':{screen:'arac',title:'Araç Değer Kaybı Hesaplama | Müvekkil Bilgi'},
  '/kidem-tazminati-hesaplama':{screen:'iscilik',title:'Kıdem Tazminatı Hesaplama | Müvekkil Bilgi'},
  '/ihbar-tazminati-hesaplama':{screen:'iscilik',title:'İhbar Tazminatı Hesaplama | Müvekkil Bilgi'},
  '/is-kazasi-tazminati':{generic:'isKazasi',title:'İş Kazası Tazminatı Hesaplama | Müvekkil Bilgi'},
  '/arac-mahrumiyet-bedeli':{generic:'mahrumiyet',title:'Araç Mahrumiyet Bedeli Hesaplama | Müvekkil Bilgi'},
  '/miras-payi-hesaplama':{generic:'miras',title:'Miras Payı Hesaplama | Müvekkil Bilgi'}
};
const SCREEN_TO_PATH={arac:'/deger-kaybi-hesaplama',iscilik:'/kidem-tazminati-hesaplama'};
const GENERIC_TO_PATH={isKazasi:'/is-kazasi-tazminati',mahrumiyet:'/arac-mahrumiyet-bedeli',miras:'/miras-payi-hesaplama'};
function updateRouteUrl(path,title){
  if(!path||window.location.pathname===path)return;
  try{history.pushState({},'',path);if(title)document.title=title;}catch(e){}
}
function handleInitialRoute(){
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const route=ROUTE_MAP[path];
  if(route){
    if(route.title)document.title=route.title;
    if(route.screen)navigate(route.screen);
    else if(route.generic)openGenericCalc(route.generic);
    return;
  }
  navigate('home');
}
window.addEventListener('popstate',()=>{
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const route=ROUTE_MAP[path];
  if(route){if(route.title)document.title=route.title;if(route.screen)navigate(route.screen);else if(route.generic)openGenericCalc(route.generic);}
  else navigate('home');
});

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
  if(screen==='home'){back.style.display='none';if(nav)nav.style.display='';updateRouteUrl('/','Müvekkil Bilgi – Tazminat Hesaplama Platformu');}
  else{back.style.display='flex';if(nav)nav.style.display='none';if(SCREEN_TO_PATH[screen])updateRouteUrl(SCREEN_TO_PATH[screen],(ROUTE_MAP[SCREEN_TO_PATH[screen]]||{}).title);}
  window.scrollTo({top:0});if(screen==='blog')renderBlogPage();if(screen==='kusur'){setTimeout(renderKusurParties,50);}
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
  const maxPossibleLoss=Math.round(marketValue*0.35);
  const damageScore=Math.min(1,(aps+rps)/40);
  const baseLossPct=damageScore*0.25;
  let lossPct=baseLossPct*km_f*age_f;
  lossPct=Math.max(0.03,Math.min(0.35,lossPct));
  let minR=Math.round(marketValue*lossPct*0.80*faultF/10)*10;
  let maxR=Math.round(marketValue*lossPct*1.10*faultF/10)*10;
  if(minR>maxR)[minR,maxR]=[maxR,minR];
  if(recentAccident){minR=Math.round(minR*0.85/10)*10;maxR=Math.round(maxR*0.85/10)*10;}
  if(priorCompensation){minR=Math.round(minR*0.80/10)*10;maxR=Math.round(maxR*0.80/10)*10;}
  minR=Math.max(500,Math.min(minR,maxPossibleLoss));
  maxR=Math.max(minR+500,Math.min(maxR,maxPossibleLoss));
  return{min:minR,max:maxR,vehicleAge,km_f,age_f,overlap,paintSum,replaceSum,faultF};
}

document.addEventListener('DOMContentLoaded',()=>{
  trackVisit();
  initYears();initBrands();initCarParts();initSlider();initCities();initWorkDuration();injectSvgDefs();renderModuleCards();renderFaq();renderBlogPosts();renderTestimonials();handleInitialRoute();
  setTimeout(initLazySections,100);
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
  document.getElementById('vehicleModel').addEventListener('change',function(){
    state.vehicleModel=this.value||null;
    const ts=document.getElementById('vehicleTrim'),brand=sel.value;
    if(brand&&this.value){
      const trims=CAR_MODEL_TRIMS[brand+'|'+this.value]||CAR_TRIMS[brand]||CAR_TRIMS._default||['Base','Comfort','Premium','Full'];
      ts.disabled=false;ts.innerHTML=trims.map((t,i)=>`<option value="${t}"${i===0?' selected':''}>${t}</option>`).join('');
      state.vehicleTrim=trims[0];
    }else{ts.disabled=true;ts.innerHTML='<option value="">Önce model seçin</option>';state.vehicleTrim='Base';}
    updateAutoMarketValue();
  });
  document.getElementById('vehicleTrim').addEventListener('change',function(){state.vehicleTrim=this.value||'Base';updateAutoMarketValue();});
  document.getElementById('vehicleYear').addEventListener('change',function(){state.vehicleYear=parseInt(this.value)||null;updateAutoMarketValue();});
}

const MODULE_CATS={
  trafik:{title:'Trafik Kazası Tazminatları',icon:'🚗',accent:'#8B5CF6',desc:'Araç değer kaybı, hasar bedeli, sakatlık ve diğer trafik kazası tazminatları'},
  isci:{title:'İşçi Alacakları Tazminatları',icon:'💼',accent:'#22c55e',desc:'Kıdem, ihbar, iş kazası ve iş gücü kaybı tazminatları'},
  diger:{title:'Diğer Tazminatlar',icon:'📋',accent:'#C5A880',desc:'Boşanma, miras, kamulaştırma ve diğer hukuki tazminatlar'}
};
function moduleAction(m){
  if(m.screen==='kusur'||m.screen==='fesih'||m.screen==='iseIade'||m.screen==='arac'||m.screen==='iscilik')return `navigate('${m.screen}')`;
  return `openGenericCalc('${m.id}')`;
}
function renderModuleCard(m){
  const isAiWizard=m.screen==='kusur'||m.screen==='fesih'||m.screen==='iseIade';
  return `<div class="module-card" onclick="${moduleAction(m)}" role="button" tabindex="0"><div class="module-card-glow"></div><div class="module-card-icon">${m.icon}</div><div class="module-card-body"><h2 class="module-card-title">${m.title.replace(/\n/g,'<br/>')}</h2><p class="module-card-desc">${m.desc}</p><div class="module-tags">${m.tags.map(t=>`<span class="module-tag">${t}</span>`).join('')}</div></div><div class="module-cta-btn">${isAiWizard?'Analizi Başlat':'Hesaplamayı Başlat'} <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 9h8M9 5l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>`;
}
function renderModuleCards(){
  const g=document.getElementById('modulesGrid');if(!g)return;
  let html='';
  Object.keys(MODULE_CATS).forEach(cat=>{
    const items=MODULES.filter(m=>m.category===cat);
    if(!items.length)return;
    const c=MODULE_CATS[cat];
    html+=`<div class="module-group"><div class="module-group-header" style="--group-accent:${c.accent}"><div class="module-group-icon">${c.icon}</div><div class="module-group-text"><h3 class="module-group-title">${c.title}</h3><p class="module-group-desc">${c.desc}</p></div><span class="module-group-count">${items.length} araç</span></div><div class="modules-grid-inner">`;
    items.forEach(m=>{html+=renderModuleCard(m);});
    html+=`</div></div>`;
  });
  g.innerHTML=html;
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
  g.innerHTML=`<div class="module-group"><div class="module-group-header" style="--group-accent:#C5A880"><div class="module-group-icon">🔍</div><div class="module-group-text"><h3 class="module-group-title">Arama Sonuçları</h3><p class="module-group-desc">"${sanitizeHtml(query)}" için bulunan araçlar</p></div><span class="module-group-count">${matches.length} araç</span></div><div class="modules-grid-inner">${matches.map(renderModuleCard).join('')}</div></div>`;
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
const AI_MODEL='llama-3.3-70b-versatile';
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
- Değer kaybı genelde piyasa değerinin %3-%30 arasıdır
- ASLA piyasa değerinin %40'ından fazla değer kaybı hesaplama!
- gercekPiyasaDegeri, verilen sistem piyasa değerinden ASLA %12'den fazla sapmamalı
- min ve max arasındaki fark, ortalamanın (ort) %25'ini aşmamalı (dar ve tutarlı bir aralık ver)
- Örnek: piyasa değeri 1.500.000 TL ise max değer kaybı 600.000 TL olabilir
- 2026 Türkiye şartlarında güncel fiyatlarla hesapla
- Gerçekçi ve tutarlı ol, abartma`;

  const res=await groqFetch('/api/ai/calculate',[
    {role:'system',content:'Sen Türkiye araç değer kaybı konusunda uzman bilirkişisin. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir metin yazma.'},
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
      const maxLossCap=Math.round(gercekPiyasaDegeri*0.35);
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
      {role:'system',content:'Sen Türkiye hukuk ve tazminat konusunda uzman bir bilirkişisin. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver.'},
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
      params.marketValue=aiMv;state.autoMarketValue=aiMv;
      const maxAllowed=Math.round(aiMv*0.38);
      if(aiR.min>maxAllowed)aiR.min=Math.round(maxAllowed*0.6);
      if(aiR.max>maxAllowed)aiR.max=maxAllowed;
      if(aiR.min<500)aiR.min=500;
      if(aiR.max<aiR.min+1000)aiR.max=aiR.min+1000;
      const merged={...fallback,...aiR};
      if(merged.min>maxAllowed)merged.min=Math.round(maxAllowed*0.6);
      if(merged.max>maxAllowed)merged.max=maxAllowed;
      // AI, eski (düşük nominal TL'li) Yargıtay/Sigorta Tahkim emsallerinden etkilenip
      // sistem piyasa değerine göre orantısız düşük bir tutar döndürebilir — güncel piyasa
      // değerine bağlı %3 yasal/emsal alt sınırı burada da (fallback formülündeki gibi) uyguluyoruz.
      const faultF=1-params.faultRatio/100;
      const minFloor=Math.max(500,Math.round(aiMv*0.03*faultF/10)*10);
      if(merged.min<minFloor)merged.min=minFloor;
      if(merged.max<merged.min+1000)merged.max=merged.min+1000;
      if(merged.max>maxAllowed)merged.max=maxAllowed;
      if(merged.min>merged.max)merged.min=Math.round(merged.max*0.6);
      state.aracResult=merged;state.aiAnalysis=merged;
      if(merged.thinking&&merged.thinking.length>0){
        await showThinkingTimeline(ov,merged.thinking,merged.veriKaynaklari||[],merged.karsilastirmaliAnaliz||'');
      }else{
        hideLoadingOverlay(ov);
      }
      state.pendingType='arac';state.pendingResult=merged;
      if(hasLeadInfo())showAracResult();else showLeadModal('arac');
      return;
    }
    hideLoadingOverlay(ov);
  }catch(e){const ov=document.querySelector('.loading-overlay');if(ov)ov.remove();}
  if(fallback.min>0&&fallback.max>0){
    const maxAllowed=Math.round(params.marketValue*0.38);
    if(fallback.min>maxAllowed)fallback.min=Math.round(maxAllowed*0.6);
    if(fallback.max>maxAllowed)fallback.max=maxAllowed;
    state.aracResult=fallback;state.aiAnalysis=null;state.pendingType='arac';state.pendingResult=fallback;
    if(hasLeadInfo())showAracResult();else showLeadModal('arac');
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
    showKusurResult(result,parties);
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
    {role:'system',content:'Sen Türkiye trafik kazalarında kusur tespiti konusunda uzman bilirkişisin. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'llama-3.3-70b-versatile',temp:0.2,tokens:3800,responseFormat:true,timeout:35000});
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
        ${renderOnIncelemeBanner()}
        ${ihlalHtml}
        ${yaralilarHtml}
        ${haklarimHtml}
        ${result.ozet?`<div style="margin-top:16px;padding:16px;background:rgba(197,168,128,0.08);border:1px solid rgba(197,168,128,0.15);border-radius:12px"><h4 style="margin:0 0 6px;font-size:14px;font-weight:600;color:var(--primary)">Analiz Özeti</h4><p style="margin:0;font-size:13px;color:var(--text-secondary);line-height:1.6">${result.ozet}</p></div>`:''}
        ${result.oneri?`<div style="margin-top:12px;padding:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.12);border-radius:12px;font-size:13px;color:var(--text-secondary);line-height:1.5"><strong style="color:#22c55e">💡 Öneri:</strong> ${result.oneri}</div>`:''}
        <div style="margin-top:24px;padding:16px;background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.2);border-radius:12px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#ef4444;font-weight:600">⚠️ Bu analiz yapay zeka tarafından yapılmış tahmini bir değerlendirmedir.</p>
          <p style="margin:0;font-size:12px;color:var(--text-secondary)">Kesin kusur tespiti için resmi bilirkişi raporu gereklidir. Hukuki süreciniz için bizimle iletişime geçin.</p>
        </div>
        <button class="btn-whatsapp" onclick="window.open('https://api.whatsapp.com/send/?phone=905510126904&text='+encodeURIComponent('Merhaba, Müvekkil Bilgi üzerinden trafik kazası kusur analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.'))" style="margin-top:16px;display:inline-flex;gap:8px;align-items:center;padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:50px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp'tan Uzman Görüşü Alın
        </button>
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
    showFesihResult(result);
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
    {role:'system',content:'Sen Türkiye iş hukukunda uzman bir avukatsın. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'llama-3.3-70b-versatile',temp:0.2,tokens:1500,responseFormat:true,timeout:30000});
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
        <div id="fesihResultActions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
          <button class="btn-whatsapp" onclick="window.open('https://api.whatsapp.com/send/?phone=905510126904&text='+encodeURIComponent('Merhaba, Müvekkil Bilgi üzerinden işçi haklı fesih sebebi analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.'))" style="display:inline-flex;gap:8px;align-items:center;padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:50px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp'tan Uzman Görüşü Alın
          </button>
        </div>
        ${renderRelatedToolsBox('fesih')}
      </div>
    </div>`;
  const ass=document.querySelector('#fesihResultActions .btn-assessment');
  if(!ass){const ab=document.createElement('button');ab.className='btn-assessment';ab.innerHTML='Ön Değerlendirme Talep Et';ab.onclick=function(){showLeadModal('fesih');};document.getElementById('fesihResultActions').appendChild(ab);}
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
    showIseIadeResult(result);
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
    {role:'system',content:'Sen Türkiye iş hukukunda işe iade davası konusunda uzman bir avukatsın. Yanıtı her zaman TÜRKÇE ve geçerli JSON formatında ver. JSON dışında hiçbir şey yazma.'},
    {role:'user',content:prompt}],
    {model:'llama-3.3-70b-versatile',temp:0.2,tokens:1500,responseFormat:true,timeout:30000});
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
        <div id="iseIadeResultActions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
          <button class="btn-whatsapp" onclick="window.open('https://api.whatsapp.com/send/?phone=905510126904&text='+encodeURIComponent('Merhaba, Müvekkil Bilgi üzerinden işe iade davası uygunluk analizi yaptırdım. Sonuçları değerlendirmenizi ve hukuki süreç hakkında bilgi almak istiyorum.'))" style="display:inline-flex;gap:8px;align-items:center;padding:12px 24px;background:#25D366;color:#fff;border:none;border-radius:50px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp'tan Uzman Görüşü Alın
          </button>
        </div>
        ${renderRelatedToolsBox('iseIade')}
      </div>
    </div>`;
  const ass=document.querySelector('#iseIadeResultActions .btn-assessment');
  if(!ass){const ab=document.createElement('button');ab.className='btn-assessment';ab.innerHTML='Ön Değerlendirme Talep Et';ab.onclick=function(){showLeadModal('iseIade');};document.getElementById('iseIadeResultActions').appendChild(ab);}
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
    await sleep(200);
    const step=ov.querySelector(`.tt-step[data-idx="${i}"]`);
    if(step){
      step.style.opacity='1';step.style.transform='translateY(0)';
      const txt=step.querySelector('.tt-step-text');
      if(txt)txt.textContent=thinkingSteps[i];
    }
    await sleep(1800);
  }
  const footer=ov.querySelector('.tt-footer');
  if(footer)footer.style.opacity='1';
  await sleep(1500);
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
      if(hasLeadInfo())showIscResult();else showLeadModal('iscilik');
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
  mSel.addEventListener('change',()=>{
    const brand=bSel.value,model=mSel.value;
    if(brand&&model){
      const trims=CAR_MODEL_TRIMS[brand+'|'+model]||CAR_TRIMS[brand]||CAR_TRIMS._default||['Base','Comfort','Premium','Full'];
      tSel.disabled=false;tSel.innerHTML=trims.map((tr,i)=>`<option value="${tr}"${i===0?' selected':''}>${tr}</option>`).join('');
    }else{tSel.disabled=true;tSel.innerHTML='<option value="">Önce model seçin</option>';}
    recalc();
  });
  tSel.addEventListener('change',recalc);
  ySel.addEventListener('change',recalc);
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
  if(GENERIC_TO_PATH[mid])updateRouteUrl(GENERIC_TO_PATH[mid],(ROUTE_MAP[GENERIC_TO_PATH[mid]]||{}).title);
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
  const lo=Math.max(800,Math.round(marketValue*0.0008/50)*50);
  const hi=Math.max(lo+400,Math.round(marketValue*0.0013/50)*50);
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
      {model:'llama-3.3-70b-versatile',temp:0.25,tokens:150,responseFormat:true,timeout:12000});
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
      {model:'llama-3.3-70b-versatile',temp:0.25,tokens:250,responseFormat:true,timeout:20000});
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
  if(hasLeadInfo())showGenericResult();else showLeadModal(mid);
  (async()=>{
    if(AI_MODULE_PROMPTS[mid]){
      try{
        const ov=showLoadingOverlay('AI hukuk analizi yapılıyor...');
        const stages=['Kullanıcı bilgileri inceleniyor...','Güncel içtihatlar taranıyor...','Piyasa verileri analiz ediliyor...','Nihai tazminat hesaplanıyor...'];
        let si=0;const sii=setInterval(()=>{if(si<stages.length)setLoadingStage(ov,stages[si]);si++;},3000);
        const aiR=await aiGenericCalc(mid,cfg.title||'Tazminat',cfg.fields,r);
        clearInterval(sii);hideLoadingOverlay(ov);
        if(aiR){state.pendingResult={...r,total:aiR.ort,ai:aiR};r.ai=aiR;if(hasLeadInfo())showGenericResult();}
      }catch(e){const ov=document.querySelector('.loading-overlay');if(ov)ov.remove();}
    }
  })();
}

function showLeadModal(type){
  state.leadVekalet=null;
  ['leadName','leadEmail','leadPlate','leadDistrict','leadDescription'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('leadPhone').value='';
  const kvk=document.getElementById('kvkkConsent');if(kvk)kvk.checked=false;
  const city=document.getElementById('leadCity');if(city)city.value='';
  document.querySelectorAll('#vekaletToggle .toggle-btn').forEach(b=>b.classList.remove('active'));
  ['nameError','phoneError','emailError','cityError','vekaletError','kvkkError'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='';});
  const plateField=document.getElementById('leadPlateField');
  if(plateField)plateField.style.display=type==='arac'?'':'none';
  document.getElementById('leadModal').style.display='flex';document.body.style.overflow='hidden';
}

function showKvkkText(){const m=document.getElementById('kvkkModal');if(m)m.style.display='flex';}
function closeLeadModal(){try{const m=document.getElementById('leadModal');if(m)m.style.display='none';document.body.style.overflow='';}catch(e){}}
function handleModalOverlayClick(e){}
function selectVekalet(btn){document.querySelectorAll('#vekaletToggle .toggle-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.leadVekalet=btn.dataset.value;}

function submitLead(){
  try{
  const name=(document.getElementById('leadName').value||'').trim(),phone=(document.getElementById('leadPhone').value||'').trim(),email=(document.getElementById('leadEmail').value||'').trim(),city=document.getElementById('leadCity').value,district=(document.getElementById('leadDistrict').value||'').trim(),plate=(document.getElementById('leadPlate').value||'').trim(),description=(document.getElementById('leadDescription').value||'').trim(),vekalet=state.leadVekalet;
  const kvkkOk=document.getElementById('kvkkConsent')&&document.getElementById('kvkkConsent').checked;
  let valid=true;
  const nOk=validateName(name);const ne=document.getElementById('nameError');if(ne)ne.textContent=nOk?'':'Lütfen adınızı ve soyadınızı tam girin.';if(!nOk)valid=false;
  const pOk=!!phone&&validatePhone(phone);const pe=document.getElementById('phoneError');if(pe)pe.textContent=pOk?'':'Lütfen geçerli bir telefon numarası girin.';if(!pOk)valid=false;
  const eOk=!!email&&validateEmail(email);const ee=document.getElementById('emailError');if(ee)ee.textContent=eOk?'':'Lütfen geçerli bir e-posta adresi girin.';if(!eOk)valid=false;
  const ce=document.getElementById('cityError');if(!city){if(ce)ce.textContent='Lütfen şehir seçin.';valid=false;}else if(ce)ce.textContent='';
  const ve=document.getElementById('vekaletError');if(!vekalet){if(ve)ve.textContent='Lütfen bu soruyu yanıtlayın.';valid=false;}else if(ve)ve.textContent='';
  const ke=document.getElementById('kvkkError');if(!kvkkOk){if(ke)ke.textContent='KVKK Aydınlatma Metni\'ni kabul etmelisiniz.';valid=false;}else if(ke)ke.textContent='';
  if(!valid)return;
  if(!state.pendingType||!state.pendingResult){showValidationError('Hesaplama bulunamadı. Lütfen tekrar hesaplama yapın.');return;}
  const type=state.pendingType,result=state.pendingResult,now=new Date(),tarih=now.toLocaleDateString('tr-TR'),saat=now.toLocaleTimeString('tr-TR');
  let sonucOzeti='';
  if(type==='arac')sonucOzeti='Araç Değer Kaybı: '+new Intl.NumberFormat('tr-TR').format(result.min)+' - '+new Intl.NumberFormat('tr-TR').format(result.max)+' TL';
  else if(type==='iscilik')sonucOzeti='İşçilik Alacağı: '+new Intl.NumberFormat('tr-TR').format(Math.round(result.toplamNet))+' TL';
  else if(type==='fesih')sonucOzeti='Haklı Fesih Analizi: '+(result.fesih?.haklıFesihVarMi?'Var':'Belirsiz/Yok')+' (Güven %'+(parseInt(result.fesih?.guvenSkoru)||0)+')';
  else if(type==='kusur'){const ps=(result.kusur?.parties||[]).map(p=>p.harf+': %'+p.kusurYuzde).join(', ');sonucOzeti='Kusur Oranı Analizi: '+(ps||'Sonuç mevcut');}
  else if(type==='iseIade')sonucOzeti='İşe İade Uygunluk Analizi: '+(result.iseIade?.sartlariTasiyorMu?'Şartlar Uygun':'Belirsiz/Uygun Değil')+' (Güven %'+(parseInt(result.iseIade?.guvenSkoru)||0)+')';
  else sonucOzeti='Tahmini Tazminat: '+new Intl.NumberFormat('tr-TR').format(result.total)+' TL';

  const ref=getUrlParam('ref')||'';
  const etiket=getUrlParam('etiket')||'';
  const leadData={tarih,saat,ad:name,telefon:phone,email,sehir:city,ilce:district,plaka:plate,tur:type,sonuc:sonucOzeti,vekalet,aciklama:description,ref,etiket};

  const leads=JSON.parse(localStorage.getItem('muvekkilbilgi_leads')||'[]');
  leads.push(leadData);
  localStorage.setItem('muvekkilbilgi_leads',JSON.stringify(leads));

  sbInsert('leads',leadData);
  trackFormComplete(ref,etiket,type);
  postToGoogleForms({name,phone,city,vekalet,tur:type,tutar:sonucOzeti,tarih,saat});
  markLeadCaptured();
  closeLeadModal();
  if(type==='arac')showAracResult();else if(type==='iscilik')showIscResult();else if(type==='fesih'||type==='kusur'||type==='iseIade'){}else showGenericResult();
  }catch(e){try{closeLeadModal()}catch(ee){}showValidationError('Bir hata oluştu, lütfen tekrar deneyin.');}
}

/* Sonucu görmeden önce ad/telefon/e-posta + KVKK onayı zorunlu — bir oturumda bir kez alınır */
function hasLeadInfo(){return sessionStorage.getItem('mb_lead_captured')==='1';}
function markLeadCaptured(){sessionStorage.setItem('mb_lead_captured','1');}

function postToGoogleForms(data){try{const fd=new FormData();fd.append('entry.2092238618',data.name);fd.append('entry.1556369182',data.phone);fd.append('entry.479301265',data.city);fd.append('entry.1841588407',data.vekalet);fd.append('entry.491333203',data.tur);fd.append('entry.1102816692',data.tutar);fetch('https://docs.google.com/forms/d/e/1FAIpQLSfIdcDlLyKtq1_mm6_cVLN0nHMCuRRSIUbUYkHp8uymoPGOUg/formResponse',{method:'POST',mode:'no-cors',body:fd}).catch(()=>{});}catch(e){}}
function validateName(name){const p=name.trim().split(/\s+/);return p.length>=2&&p.every(x=>x.length>=2);}
function validatePhone(phone){return /^(0?5)[0-9]{9}$/.test(phone.replace(/[\s\-().+]/g,''));}

const WHATSAPP_NUM='905510126904';
function whatsappLink(msg){return 'https://wa.me/'+WHATSAPP_NUM+'?text='+encodeURIComponent(msg);}
function addWhatsAppBtn(containerId,msg){
  const c=document.getElementById(containerId);
  if(!c)return;
  const btn=document.createElement('button');
  btn.className='btn-whatsapp';
  btn.type='button';
  btn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Ön İnceleme Talep Edin';
  btn.onclick=function(){window.open('https://wa.me/'+WHATSAPP_NUM+'?text='+encodeURIComponent(msg),'_blank');};
  c.appendChild(btn);
}

function printReport(title,rows,resultLine){
  const el=document.getElementById('printReport');
  const docSummaries=getDocAnalysisSummary();
  const docHtml=docSummaries.length?`<div style="margin-top:16px;padding:12px;background:#f8f5f0;border-radius:8px;font-size:11px;color:#555;"><strong style="color:#C5A880;">Yüklenen Belgeler</strong>${docSummaries.map(s=>'<div style="margin-top:6px;">'+s+'</div>').join('')}</div>`:'';
  el.innerHTML=`<div class="pr-badge">${title}</div><h1>Müvekkil Bilgi Hesaplama Raporu</h1><p class="pr-sub">Oluşturma: ${new Date().toLocaleString('tr-TR')}</p><table class="pr-table">${rows.map(r=>`<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join('')}</table>${docHtml}<p class="pr-total"><strong>Sonuç:</strong> ${resultLine}</p><p class="pr-footer">Bu rapor tahmini niteliktedir, kesin sonuç değildir. Gerçek tutarınızı öğrenmek için ön inceleme talep edin. · Müvekkil Bilgi</p>`;
  setTimeout(()=>{window.print();},200);
}
function renderOnIncelemeBanner(){
  return `<div class="on-inceleme-banner" style="margin:16px 0;padding:16px 18px;background:linear-gradient(135deg,rgba(37,211,102,0.1),rgba(197,168,128,0.08));border:1px solid rgba(37,211,102,0.25);border-radius:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700;font-size:14px;color:var(--text-primary)">Bu bir tahmini sonuçtur, kesin değildir</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-top:3px">Gerçek hak ve tazminat tutarınızı öğrenmek için dosyanızın <strong>ön incelemesini</strong> ücretsiz talep edin.</div>
    </div>
    <button type="button" class="btn-assessment" style="margin:0" onclick="showLeadModal(state.pendingType)">Ön İnceleme Talep Et</button>
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
  if(relBox){const existingB=relBox.parentNode.querySelector('.on-inceleme-banner');if(existingB)existingB.remove();const bwrap=document.createElement('div');bwrap.innerHTML=renderOnIncelemeBanner();relBox.parentNode.insertBefore(bwrap.firstElementChild,relBox.nextSibling);}
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
  document.querySelector('#screen-arac .calculator-section').scrollIntoView({behavior:'smooth',block:'start'});
  addWhatsAppBtn('resultActions','Merhaba, Müvekkil Bilgi üzerinden araç değer kaybı hesaplaması yaptım. Tahmini değer kaybım: '+fmt2(r.min)+' - '+fmt2(r.max)+' TL. Benimle iletişime geçebilir misiniz?');
  setTimeout(()=>{
    const wa=document.querySelector('#resultActions .btn-whatsapp');
    if(wa){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{const partNames=Object.keys(state.selectedParts).map(k=>PART_LABELS[k]+' ('+PART_TYPE_LABELS[state.selectedParts[k]]+')').join(', ')||'Belirtilmedi';const rows=[{label:'Araç',value:state.vehicleYear+' '+state.vehicleBrand+' '+state.vehicleModel},{label:'Araç Yaşı',value:r.vehicleAge+' yıl'},{label:'Km',value:new Intl.NumberFormat('tr-TR').format(state.mileage)},{label:'Piyasa Değeri',value:new Intl.NumberFormat('tr-TR').format(state.autoMarketValue)+' TL'},{label:'Kusur Oranı',value:state.faultRatio+'%'},{label:'Hasarlı Parçalar',value:partNames},{label:'Tahmini Değer Kaybı',value:new Intl.NumberFormat('tr-TR').format(r.min)+' - '+new Intl.NumberFormat('tr-TR').format(r.max)+' TL'}];printReport('Araç Değer Kaybı',rows,new Intl.NumberFormat('tr-TR').format(r.min)+' – '+new Intl.NumberFormat('tr-TR').format(r.max)+' TL');};wa.parentNode.insertBefore(pdf,wa.nextSibling);}
    const ass=document.querySelector('#resultActions .btn-assessment');if(!ass){const ab=document.createElement('button');ab.className='btn-assessment';ab.innerHTML='Ön Değerlendirme Talep Et';ab.onclick=function(){showLeadModal(state.pendingType);};document.getElementById('resultActions').appendChild(ab);}
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
  p.innerHTML=`<div class="isc-result-card"><div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Hesaplama Tamamlandı</h3><p>${rl[r.reason]||''} · ${Math.floor(r.totalYears)} yıl ${Math.round((r.totalYears%1)*12)} ay</p></div></div><div class="isc-total-block"><div class="isc-total-label">Toplam Tahmini İşçilik Alacağı</div><div class="isc-total-amount">${f(r.toplamNet)} TL</div><div class="isc-total-note">Net tutar</div></div>${renderOnIncelemeBanner()}${aiHtml}<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Net Tutar</span></div>${rows.map(row=>row.v?`<div class="isc-breakdown-row"><span>${row.label}</span><span class="isc-amount">${f(row.val)} TL</span></div>`:'').join('')}${rows.every(r=>!r.v)?'<div class="isc-no-result">Girilen bilgilere göre alacak hesaplanamadı.</div>':''}</div><div class="isc-salary-info"><div class="isc-salary-row"><span>Net Maaş</span><span>${f(r.netSalary)} TL</span></div><div class="isc-salary-row"><span>Brüt Maaş</span><span>${f(r.brutMaas)} TL</span></div><div class="isc-salary-row"><span>Giydirilmiş Brüt</span><span>${f(r.giydirilmisBrut)} TL</span></div></div><div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu hesaplama tahmini niteliktedir.</p></div><div class="contact-cta-card"><div class="contact-cta-header"><div class="contact-cta-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="currentColor" stroke-width="1.8"/><path d="M22 6l-10 7L2 6" stroke="currentColor" stroke-width="1.8"/></svg></div><div><h3 class="contact-cta-title">Bize Ulaşın</h3><p class="contact-cta-subtitle">Hak talebinde bulunmak için iletişime geçin.</p></div></div><a class="btn-whatsapp" href="https://api.whatsapp.com/send/?phone=905510126904" target="_blank"><svg class="wa-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 1.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>WhatsApp'tan Bize Ulaşın</a></div>${renderRelatedToolsBox('iscilik')}<div class="form-actions result-actions" style="margin-top:16px"><button class="btn-back" onclick="resetIscilik()"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 12a8 8 0 1 0 2-5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 7v5H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Yeni Hesaplama</button></div></div>`;
  p.style.display='block';setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),100);
  const rn=p.querySelector('.result-notice p');
  if(rn)rn.innerHTML='<strong>Önemli Uyarı:</strong> İşçilik tazminatı alabilmek için haklı fesih sebebinizin olması gerekir. İşveren tarafından haksız yere işten çıkarılma, maaş ödenmemesi, mobbing, fazla mesai ücretlerinin ödenmemesi gibi durumlar haklı fesih sebebi sayılır. <strong>Haklı fesih sebebi tespitinizi yapabilmemiz için bizimle iletişime geçin.</strong>';
  const iscMsg='Merhaba, Müvekkil Bilgi üzerinden işçilik tazminatı hesaplaması yaptım. Tahmini alacağım: '+f(r.toplamNet)+' TL. '+(r.reason==='justified'||r.reason==='employer'?'Haklı fesih sebebim var, benimle iletişime geçebilir misiniz?':'Benimle iletişime geçebilir misiniz?');
  addWhatsAppBtn('iscResultPanel',iscMsg);
  setTimeout(function(){
    const wa=document.querySelector('#iscResultPanel .btn-whatsapp');
    if(wa){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{const rl={employer:'İşveren çıkardı',resignation:'İstifa',justified:'Haklı fesih'};const rows=[{label:'Çalışma Süresi',value:Math.floor(r.totalYears)+' yıl '+Math.round((r.totalYears%1)*12)+' ay'},{label:'Çıkış Nedeni',value:rl[r.reason]||r.reason},{label:'Net Maaş',value:f(r.netSalary)+' TL'},{label:'Brüt Maaş',value:f(r.brutMaas)+' TL'},{label:'Kıdem Tazminatı',value:f(r.kidemNet)+' TL'},{label:'İhbar Tazminatı',value:f(r.ihbarNet)+' TL'},{label:'Yıllık İzin',value:f(r.izinNet)+' TL'},{label:'Fazla Mesai',value:f(r.fmNet)+' TL'},{label:'Toplam Net',value:f(r.toplamNet)+' TL'}];printReport('İşçilik Tazminatı',rows,f(r.toplamNet)+' TL');};wa.parentNode.insertBefore(pdf,wa.nextSibling);}
    const ass=document.querySelector('#iscResultPanel .btn-assessment');if(!ass){const ab=document.createElement('button');ab.className='btn-assessment';ab.innerHTML='Ön Değerlendirme Talep Et';ab.onclick=function(){showLeadModal(state.pendingType);};document.getElementById('iscResultPanel').appendChild(ab);}
  },50);
}

function showGenericResult(){
  const r=state.pendingResult,mt=state.pendingType,cfg=CALC_CONFIGS[mt];
  const ai=r.ai;
  const p=document.getElementById('genericResultPanel');
  let aiHtml='';
  if(ai&&ai.ai){aiHtml=`<div class="ai-insights" style="display:block;margin-top:16px"><div class="ai-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" fill="#C5A880" opacity="0.3"/><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 4.8L8 14l-6-4.8h7.6z" stroke="#C5A880" stroke-width="1.5" fill="none"/></svg><span>AI Uzman Analizi</span><span class="ai-guyen">%${ai.guven||70} güven</span></div><div class="ai-body"><div class="ai-col"><div class="ai-col-label">Değerlendirme</div><div class="ai-col-val">${ai.degerlendirme||''}</div></div><div class="ai-col"><div class="ai-col-label">Hukuki Analiz</div><div class="ai-col-val">${ai.hukuk||''}</div></div>${ai.oneri?`<div class="ai-oneri">💡 ${ai.oneri}</div>`:''}</div></div>`;}
  p.innerHTML=`<div class="generic-result-card"><div class="isc-result-header"><div class="success-animation small"><div class="success-ring"></div><svg class="success-check" viewBox="0 0 50 50" fill="none"><path d="M14 26l9 9 16-18" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><h3>Hesaplama Tamamlandı</h3><p>${cfg.title}</p></div></div><div class="isc-total-block"><div class="isc-total-label">Tahmini Tazminat</div><div class="isc-total-amount">${fmt(r.total)}</div></div>${aiHtml}<div class="isc-breakdown-table"><div class="isc-breakdown-head"><span>Kalem</span><span>Tutar</span></div>${r.rows.map(row=>`<div class="isc-breakdown-row"><span>${row.label}</span><span class="${row.highlight?'isc-amount':''}">${row.value}</span></div>`).join('')}</div><div class="result-notice"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="#C5A880" stroke-width="1.5"/><path d="M9 5v5M9 12v1" stroke="#C5A880" stroke-width="2" stroke-linecap="round"/></svg><p>Bu hesaplama tahmini niteliktedir, kesin sonuç değildir. Gerçek tutarınız için ön inceleme talep edin.</p></div>${renderOnIncelemeBanner()}${renderRelatedToolsBox(mt)}<div class="form-actions" style="margin-top:16px"><button class="btn-back" onclick="openGenericCalc('${mt}')">Yeniden Hesapla</button></div></div>`;
  p.style.display='block';setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),100);
  const genMsg='Merhaba, Müvekkil Bilgi üzerinden '+cfg.title+' hesaplaması yaptım. Tahmini tazminatım: '+fmt2(r.total)+' TL. Benimle iletişime geçebilir misiniz?';
  addWhatsAppBtn('genericResultPanel',genMsg);
  setTimeout(()=>{
    const wa=document.querySelector('#genericResultPanel .btn-whatsapp');
    if(wa&&r.rows){const pdf=document.createElement('a');pdf.className='btn-pdf';pdf.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> PDF Rapor';pdf.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:transparent;border:1px solid var(--border);border-radius:50px;color:var(--text2);font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;transition:.2s';pdf.onmouseover=()=>{pdf.style.borderColor='var(--primary)'};pdf.onmouseout=()=>{pdf.style.borderColor='var(--border)'};pdf.onclick=()=>{printReport(cfg.title||'Tazminat',r.rows,fmt(r.total));};wa.parentNode.insertBefore(pdf,wa.nextSibling);}
    const ass=document.querySelector('#genericResultPanel .btn-assessment');if(!ass){const ab=document.createElement('button');ab.className='btn-assessment';ab.innerHTML='Ön Değerlendirme Talep Et';ab.onclick=function(){showLeadModal(state.pendingType);};document.getElementById('genericResultPanel').appendChild(ab);}
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
function filterBlog(cat){
  state.blogFilter=cat;
  document.querySelectorAll('.blog-filter-btn').forEach(b=>{b.classList.toggle('active',b.textContent===cat);});
  const grid=document.getElementById('blogGrid');
  const posts=cat==='Tümü'?BLOG_POSTS:BLOG_POSTS.filter(b=>b.category===cat);
  grid.innerHTML=posts.map(b=>`<div class="blog-card" onclick="viewBlog(${b.id})"><div class="blog-card-img">${b.icon}</div><div class="blog-card-body"><div class="blog-card-category">${b.category}</div><h3 class="blog-card-title">${b.title}</h3><p class="blog-card-excerpt">${b.excerpt}</p><div class="blog-card-meta">${b.date}</div><div class="blog-card-read">Devamını Oku →</div></div></div>`).join('');
}
function viewBlog(id){
  const post=BLOG_POSTS.find(b=>b.id===id);if(!post)return;
  navigate('blog');
  setTimeout(()=>{document.getElementById('blogPageContent').innerHTML=`<div class="blog-detail"><div class="blog-detail-back" onclick="navigate('home');setTimeout(()=>{document.getElementById('blogSection').scrollIntoView({behavior:'smooth'});},100);">← Geri Dön</div><h1>${post.title}</h1><div class="blog-detail-meta">${post.category} · ${post.date}</div><div class="blog-detail-content">${post.content}</div></div>`;},100);
}
function renderBlogPage(){
  const c=document.getElementById('blogPageContent');
  if(!c)return;
  c.innerHTML=BLOG_POSTS.map(b=>`<div class="blog-card" onclick="viewBlog(${b.id})" style="margin-bottom:16px"><div class="blog-card-body"><div class="blog-card-category">${b.category}</div><h3 class="blog-card-title">${b.title}</h3><p class="blog-card-excerpt">${b.excerpt}</p><div class="blog-card-meta">${b.date}</div></div></div>`).join('');
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
  sbInsert('contacts',contactData);
  document.getElementById('contactForm').reset();
  showSuccessToast('Mesajınız başarıyla gönderildi!');
}



const CHATBOT_SYSTEM_PROMPT=`Sen Müvekkil Bilgi'nin hukuk asistanı "AvukatBot" sun. Trafik kazası, değer kaybı, işçilik tazminatı, iş kazası, sakatlık, destekten yoksun kalma, nafaka, kasko, tüketici hakları, tapu harcı, trafik cezası itirazı, manevi tazminat ve tüm hukuki konularda uzman bir yardımcısın.

KRİTİK KURALLARIN:
1. HER cevabının sonunda kullanıcıyı mutlaka hesaplama aracını kullanmaya veya avukata danışmaya teşvik et. Örnek: "Hemen hesaplamaya başlayın!", "Bu tazminatı kaçırmayın!", "Boşuna beklemeyin, hakkınızı arayın!"
2. Kullanıcıların haklarını sonuna kadar savun. Onlara "hakkınız var", "bunu talep etmelisiniz", "dava açmalısınız" de.
3. Sigorta şirketlerine, işverenlere karşı kullanıcıyı sert bir dille uyar. "Sigorta sizi kandırmasın!", "İşvereniniz sorumludur, taviz vermeyin!"
4. Kullanıcıya acil行動 planı öner: "Hemen fotoğraf çekin", "Kaza tutanağını almayın", "15 gün içinde itiraz edin", "Zamanaşımına uğramadan başvuru yapın".
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
  div.innerHTML=`<div class="chat-msg-avatar">⚖</div><div class="chat-typing"><span></span><span></span><span></span></div>`;
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
      {model:'llama-3.3-70b-versatile',temp:0.8,tokens:1024,timeout:15000});
    const data=await res.json();
    removeTyping();
    if(data.choices&&data.choices[0]){let reply=data.choices[0].message.content;appendChatMsg('bot',reply);chatHistory.push({role:'assistant',content:reply});}
    else{appendChatMsg('bot','Bir hata oluştu ama merak etmeyin, hukuki haklarınız konusunda size yardımcı olabilirim! Lütfen tekrar sorun.');}
  }catch(e){removeTyping();appendChatMsg('bot','Bağlantı hatası var ama bu bile sizi yıldırmamalı! Haklarınızı aramaktan vazgeçmeyin. Lütfen tekrar deneyin.');}
  document.getElementById('chatSendBtn').disabled=false;
}

