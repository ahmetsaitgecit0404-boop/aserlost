-- ============================================================
-- MÜVEKKİL BİLGİ — FAZ 0 ŞEMA GENİŞLETMESİ
-- Yalnızca EKLEME yapar. Hiçbir sütun, tablo veya veri silinmez.
-- Tekrar çalıştırılabilir (IF NOT EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- 1) leads: başvuru kaydı alanları
-- ------------------------------------------------------------
alter table public.leads add column if not exists basvuru_no          text;
alter table public.leads add column if not exists arac_kodu           text;
alter table public.leads add column if not exists cevaplar            jsonb;
alter table public.leads add column if not exists sonuc_json          jsonb;
alter table public.leads add column if not exists kural_surumu        text;
alter table public.leads add column if not exists tutar               numeric;
alter table public.leads add column if not exists aciliyet            text;
alter table public.leads add column if not exists puan                integer;
alter table public.leads add column if not exists durum               text default 'yeni';

-- KVKK ve iletişim izni (izin AYRI ve varsayılan KAPALI)
alter table public.leads add column if not exists iletisim_izni       boolean default false;
alter table public.leads add column if not exists izin_zamani         timestamptz;
alter table public.leads add column if not exists izin_metin_surumu   text;
alter table public.leads add column if not exists izin_geri_cekildi   boolean default false;
alter table public.leads add column if not exists kvkk_surumu         text;
alter table public.leads add column if not exists kvkk_zamani         timestamptz;

-- Kampanya / kaynak
alter table public.leads add column if not exists utm_source          text;
alter table public.leads add column if not exists utm_medium          text;
alter table public.leads add column if not exists utm_campaign        text;
alter table public.leads add column if not exists utm_content         text;
alter table public.leads add column if not exists ref_kod             text;
alter table public.leads add column if not exists meslek              text;
alter table public.leads add column if not exists konu                text;

-- Dönüşüm zaman damgaları
alter table public.leads add column if not exists ts_form_baslangic   timestamptz;
alter table public.leads add column if not exists ts_sorular_bitti    timestamptz;
alter table public.leads add column if not exists ts_iletisim_ekrani  timestamptz;
alter table public.leads add column if not exists ts_iletisim_girildi timestamptz;
alter table public.leads add column if not exists ts_sonuc_goruldu    timestamptz;
alter table public.leads add column if not exists ts_whatsapp         timestamptz;
alter table public.leads add column if not exists ts_pdf              timestamptz;
alter table public.leads add column if not exists whatsapp_tiklandi   boolean default false;
alter table public.leads add column if not exists whatsapp_kullanici_baslatti boolean default false;

-- Dosya yönetimi
alter table public.leads add column if not exists belge_sayisi        integer default 0;
alter table public.leads add column if not exists atanan_avukat       text;
alter table public.leads add column if not exists notlar              text;
alter table public.leads add column if not exists guncelleme          timestamptz default now();

-- Başvuru numarası benzersiz (boş olanlar hariç)
create unique index if not exists leads_basvuru_no_uniq
  on public.leads (basvuru_no) where basvuru_no is not null;
create index if not exists leads_durum_idx on public.leads (durum);
create index if not exists leads_puan_idx  on public.leads (puan desc);


-- ------------------------------------------------------------
-- 2) Başvuru numarası sayacı — yarış koşulu olmadan üretir
-- ------------------------------------------------------------
create table if not exists public.basvuru_sayac (
  yil        integer primary key,
  son_numara integer not null default 0
);
alter table public.basvuru_sayac enable row level security;

create or replace function public.basvuru_no_uret()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from now())::int;
  n integer;
begin
  insert into public.basvuru_sayac (yil, son_numara)
  values (y, 1)
  on conflict (yil) do update
    set son_numara = basvuru_sayac.son_numara + 1
  returning son_numara into n;

  return 'MB-' || y || '-' || lpad(n::text, 6, '0');
end
$$;


-- ------------------------------------------------------------
-- 3) Hukuki kurallar — versiyonlu, sonradan güncellenebilir
--    dogrulandi=false olanlar kullanıcıya "hukukçu doğrulaması
--    bekliyor" rozetiyle gösterilir.
-- ------------------------------------------------------------
create table if not exists public.kurallar (
  id                bigserial primary key,
  ad                text not null,
  alan              text,
  deger             numeric,
  deger_json        jsonb,
  birim             text,
  gecerli_baslangic date not null default '2000-01-01',
  gecerli_bitis     date,
  kaynak            text,
  not_metni         text,
  dogrulandi        boolean not null default false,
  aktif             boolean not null default true,
  guncelleyen       text,
  guncelleme        timestamptz default now()
);
alter table public.kurallar enable row level security;
create index if not exists kurallar_ad_idx on public.kurallar (ad, gecerli_baslangic desc);


-- ------------------------------------------------------------
-- 4) Analytics olayları — KİŞİSEL VERİ İÇERMEZ
--    ad, telefon, e-posta, olay açıklaması ve belge burada tutulmaz.
-- ------------------------------------------------------------
create table if not exists public.olaylar (
  id           bigserial primary key,
  olay         text not null,
  arac_kodu    text,
  basvuru_no   text,
  utm_source   text,
  utm_campaign text,
  utm_content  text,
  ref_kod      text,
  meta         jsonb,
  olusturma    timestamptz default now()
);
alter table public.olaylar enable row level security;
create index if not exists olaylar_olay_idx on public.olaylar (olay, olusturma desc);


-- ------------------------------------------------------------
-- 5) Kontrol
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='leads')      as leads_sutun_sayisi,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='kurallar')   as kurallar_tablosu,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='olaylar')    as olaylar_tablosu,
  public.basvuru_no_uret()                                    as ornek_basvuru_no;

-- ------------------------------------------------------------
-- 6) EK: numara üretimi yalnızca sunucudan çağrılabilsin
--    PostgREST fonksiyonları varsayılan olarak anon rolüne de açıyor;
--    kapatılmazsa dışarıdan çağrılıp sayaç boşuna şişirilebiliyor.
-- ------------------------------------------------------------
revoke execute on function public.basvuru_no_uret() from anon, authenticated, public;
grant  execute on function public.basvuru_no_uret() to service_role;
