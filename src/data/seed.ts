import type {
  AppUser,
  Category,
  City,
  Company,
  DB,
  Lead,
  LeadVisit,
  Membership,
  Payment,
  Referral,
  Sale,
  SalesRep,
  Settings,
} from "../lib/types";
import { slugify, uniqueSlug } from "../lib/slug";

/**
 * ÖRNEK VERİ — Afyonkarahisar faaliyetsizliği için gerçekçi örnek firmalar.
 * Gerçek işletme verisi değildir; tel ve adresler örnek amaçlıdır.
 */

const vatandaşKategoriler: Category[] = [];

const DEMO_USER_PASSWORD = "demo"; // Yalnızca demo oturumu için; gerçek kimlik doğrulama Supabase ile yapılır.

export const DEMO_PASSWORD = DEMO_USER_PASSWORD;

export const defaultSettings: Settings = {
  membershipPrice: 1000,
  repCommission: 600,
  referralReward: 100,
  renewalCommission: 600,
  updatedAt: new Date().toISOString(),
};

const categories: Array<[string, string]> = [
  ["Yemek & İçecek", "🍽️"],
  ["Kuyumculuk", "💎"],
  ["Otomotiv", "🔧"],
  ["Sağlık & Eczane", "🏥"],
  ["Eğitim", "📚"],
  ["Yapı & İnşaat", "🏗️"],
  ["Konaklama", "🏨"],
  ["Tarım & Hayvancılık", "🌾"],
  ["Nakliyat", "📦"],
];

const districts = [
  "Merkez",
  "Bolvadin",
  "Çay",
  "Dinar",
  "Emirdağ",
  "İhsaniye",
  "İscehisar",
  "Sandıklı",
  "Sinanpaşa",
  "Sultandağı",
  "Şuhut",
];

const companySeed: Array<
  Omit<Company, "id" | "slug" | "createdAt" | "updatedAt">
> = [
  {
    name: "Afyon Sucuk Sarayı",
    categoryId: "",
    cityId: "",
    district: "Merkez",
    address: " Cumhuriyet Cad. No:41 Merkez, Afyonkarahisar",
    phone: "0272 213 41 21",
    email: "siparis@afyonsucuksarayi.com",
    website: "https://afyonsucuksarayi.example.com",
    socials: { instagram: "afyonsucuksarayi", facebook: "afyonsucuksarayi" },
    description:
      "1923 yılından bu yana geleneksel yatırımlarıyla üretilen Afyon sucuğu, pastırma ve kaymak ürünlerinde uzman aile işletmesi.",
    images: ["🥓", "🍖", "🛒"],
    hours: { weekday: "08:00 - 19:00", saturday: "08:00 - 19:00", sunday: "09:00 - 14:00" },
    featured: true,
    published: true,
  },
  {
    name: "Öz Miras Kuyumculuk",
    categoryId: "",
    cityId: "",
    district: "Merkez",
    address: "Zafer Cad. No:12 Merkez, Afyonkarahisar",
    phone: "0272 212 88 03",
    email: "info@ozmiraskuyum.com",
    website: "https://ozmiraskuyum.example.com",
    socials: { instagram: "ozmiraskuyum" },
    description:
      "Afyon kaymağı desenli takılardan sertifikalı altın bileziklere; hayali ürünlerde uzman kuyumcu.",
    images: ["💍", "💎", "🪙"],
    hours: { weekday: "09:00 - 18:30", saturday: "09:00 - 18:30", sunday: "Kapalı" },
    featured: true,
    published: true,
  },
  {
    name: "Kadınana Pastane ve Fırını",
    categoryId: "",
    cityId: "",
    district: "Merkez",
    address: "Atatürk Bul. No:104 Merkez, Afyonkarahisar",
    phone: "0272 217 65 40",
    email: "kadinana@pastane.com",
    website: undefined,
    socials: { instagram: "kadiranapastane" },
    description:
      "1908 yılından kalma şarbon fırını ile her taze ekmek, kremalı yağ çiksi ve Afyon usulü pastalarıyla tanınan köklü pastane.",
    images: ["🥐", "🎂", "🥖"],
    hours: { weekday: "06:30 - 22:00", saturday: "06:30 - 22:00", sunday: "07:00 - 21:00" },
    featured: true,
    published: true,
  },
  {
    name: "Sandıklı Termal Otel",
    categoryId: "",
    cityId: "",
    district: "Sandıklı",
    address: "Termal Yolu No:5 Sandıklı, Afyonkarahisar",
    phone: "0272 616 04 40",
    email: "rezervasyon@sandiklitermal.example.com",
    website: "https://sandiklitermal.example.com",
    socials: {},
    description:
      "Hüda hamamları ve kaplıca suyuyla şifa amaçlı vadetilen termal otel; 46 derece su sıcaklığındaki havuzlarla serhaletme hizmeti.",
    images: ["🏨", "♨️", "🏊"],
    hours: { weekday: "07:00 - 23:00", saturday: "07:00 - 23:00", sunday: "07:00 - 23:00" },
    featured: true,
    published: true,
  },
  {
    name: "Ecdat Bal ve Kaymacılık",
    categoryId: "",
    cityId: "",
    district: "Bolvadin",
    address: "Hükümet Cad. No:7 Bolvadin, Afyonkarahisar",
    phone: "0272 412 30 15",
    email: "ecdathilal@gmail.com",
    website: undefined,
    socials: { whatsapp: "905551230022" },
    description:
      "Bolvadin kırlarından kendi kovanlarından doğal petek bal ve Afyon kaymağı üretimi yapan tarım işletmesi.",
    images: ["🍯", "🐝", "🧴"],
    hours: { weekday: "08:00 - 18:00", saturday: "08:00 - 16:00", sunday: "Kapalı" },
    featured: false,
    published: true,
  },
  {
    name: "Aygın Otomotiv Servis",
    categoryId: "",
    cityId: "",
    district: "Merkez",
    address: "Sanayi Sitesi 4. Blok No:18 Merkez, Afyonkarahisar",
    phone: "0272 226 71 90",
    email: "servis@ayginoto.com",
    website: undefined,
    socials: {},
    description:
      "Tüm marka araçlarda yağ-periyot bakımı, mekanik tamir ve yedek parça satışı yapan yetkili teknisyenli servis.",
    images: ["🛠️", "🚗", "🔩"],
    hours: { weekday: "08:30 - 18:00", saturday: "08:30 - 14:00", sunday: "Kapalı" },
    featured: false,
    published: true,
  },
  {
    name: "Çay Pazar Eczanesi",
    categoryId: "",
    cityId: "",
    district: "Çay",
    address: "Kaymakam Ekrem Bey Cad. No:29 Çay, Afyonkarahisar",
    phone: "0272 641 20 11",
    email: "caypazareczanesi@gmail.com",
    website: undefined,
    socials: {},
    description:
      "Reçeteli ilaç, dermokozmetik ve bebek ürünleri satışı yapan köy aile sağlığına yakın hizmet verilen mahalle eczanesi.",
    images: ["💊", "🩹", "🧪"],
    hours: { weekday: "08:30 - 18:30", saturday: "08:30 - 14:00", sunday: "Kapalı" },
    featured: false,
    published: true,
  },
  {
    name: "İscehisar Doğal Taş Mermer",
    categoryId: "",
    cityId: "",
    district: "İscehisar",
    address: "Ocgelik Yolu 3. Km İscehisar, Afyonkarahisar",
    phone: "0272 655 10 24",
    email: "satis@iscehisartas.com",
    website: "https://iscehisartas.example.com",
    socials: { instagram: "iscehisartas" },
    description:
      "Afyon beyaz mermer, bej traverten ve alter taş ürünlerinde ocaktan çıkarma ve kesme hizmetleri veren mermer atölyesi.",
    images: ["🪨", "🏗️", "⚖️"],
    hours: { weekday: "08:00 - 17:30", saturday: "08:00 - 14:00", sunday: "Kapalı" },
    featured: true,
    published: true,
  },
  {
    name: "Emirdağ Nakliyat Hizmetleri",
    categoryId: "",
    cityId: "",
    district: "Emirdağ",
    address: "Ankara Yolu Üzeri No:3 Emirdağ, Afyonkarahisar",
    phone: "0272 571 40 33",
    email: "emirdagnakliyat@outlook.com",
    website: undefined,
    socials: { whatsapp: "905551230044" },
    description:
      "Yurt içi evden eve nakliyat, ofis taşımacılığı ve sigortalı parsiyel yük hizmetleri sunan nakliye firması.",
    images: ["🚚", "📦", "🗺️"],
    hours: { weekday: "08:00 - 20:00", saturday: "08:00 - 20:00", sunday: "09:00 - 18:00" },
    featured: false,
    published: true,
  },
  {
    name: "Sinanpaşa Yapı Market",
    categoryId: "",
    cityId: "",
    district: "Sinanpaşa",
    address: "Dinar Yolu No:91 Sinanpaşa, Afyonkarahisar",
    phone: "0272 253 11 06",
    email: "sinanpasayapimarket@gmail.com",
    website: undefined,
    socials: {},
    description:
      "Boya, demir, ısıtma-soğutma ve inşaat malzemeleri satışı yapan bölge sakinlerine güvenilir tedarik sağlayan yapı marketi.",
    images: ["🔨", "🪣", "🧱"],
    hours: { weekday: "08:00 - 19:00", saturday: "08:00 - 17:00", sunday: "Kapalı" },
    featured: false,
    published: true,
  },
  {
    name: "Akademi Dershanesi",
    categoryId: "",
    cityId: "",
    district: "Merkez",
    address: "Kurtuluş Yolu No:2 Merkez, Afyonkarahisar",
    phone: "0272 228 55 77",
    email: "kayit@akademiders.com",
    website: "https://akademiders.example.com",
    socials: { instagram: "akademiders" },
    description:
      "LGS, YKS ve KPSS hazırlık kursları; 12 kişilik sınıflar ve ücretsiz deneme sınavlarıyla eğitim kurumu.",
    images: ["🎓", "📖", "🧮"],
    hours: { weekday: "16:00 - 21:00", saturday: "09:00 - 19:00", sunday: "09:00 - 17:00" },
    featured: false,
    published: true,
  },
  {
    name: "Şuhut Kiraz Pazarlama Kooperatifi",
    categoryId: "",
    cityId: "",
    district: "Şuhut",
    address: "Merkez Mah. Pazar Yeri No:1 Şuhut, Afyonkarahisar",
    phone: "0272 681 30 50",
    email: "suhutkiraz@example.com",
    website: undefined,
    socials: {},
    description:
      "Şuhut kirazını dış pazarlara taşıyan üretici kooperatifi; lalehnin sonlanma döneminde gün kurulu suanlar düzenlenir.",
    images: ["🍒", "🌾", "🧺"],
    hours: { weekday: "07:00 - 17:00", saturday: "07:00 - 15:00", sunday: "Kapalı" },
    featured: false,
    published: true,
  },
];

export function seedDB(): DB {
  const now = new Date().toISOString();

  const cats: Category[] = categories.map(([name, icon], i) => ({
    id: `cat-${i + 1}`,
    name,
    slug: slugify(name),
    icon,
  }));
  void vatandaşKategoriler;

  const city: City = {
    id: "city-afyon",
    name: "Afyonkarahisar",
    slug: "afyonkarahisar",
    districts: [...districts],
  };

  const reps: SalesRep[] = [
    {
      id: "rep-1",
      name: "Ayşe Yılmaz",
      phone: "0555 123 45 01",
      code: "AF-001",
      status: "aktif",
      createdAt: now,
    },
    {
      id: "rep-2",
      name: "Mehmet Demir",
      phone: "0555 123 45 02",
      code: "AF-002",
      status: "aktif",
      createdAt: now,
    },
  ];

  const existingSlugs = companySeed.map((c) => slugify(c.name));
  const companies: Company[] = companySeed.map((c, i) => {
    const cat = cats[i % cats.length];
    return {
      ...c,
      id: `co-${i + 1}`,
      slug: uniqueSlug(c.name, existingSlugs.slice(0, i)),
      categoryId: cat.id,
      cityId: city.id,
      repId: i % 3 === 0 ? "rep-1" : i % 3 === 1 ? "rep-2" : undefined,
      createdAt: now,
      updatedAt: now,
    };
  });

  const settings: Settings = { ...defaultSettings };

  // Örnek gerçekleşmiş satış + üyelik + komisyon (demo verisi, üretime ait değildir)
  const sale: Sale = {
    id: "sale-1",
    repId: "rep-1",
    companyId: companies[0].id,
    channel: "temsilci",
    amount: settings.membershipPrice,
    status: "odendi",
    createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
    confirmedAt: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
  };
  const payment: Payment = {
    id: "pay-1",
    saleId: sale.id,
    amount: sale.amount,
    provider: "hicbiri",
    providerRef: "DEMO-REF-0001",
    status: "onaylandi",
    idempotencyKey: "demo-key-1",
    createdAt: sale.createdAt,
    updatedAt: sale.confirmedAt ?? sale.createdAt,
  };
  const membership: Membership = {
    id: "mem-1",
    companyId: companies[0].id,
    saleId: sale.id,
    startsAt: sale.confirmedAt ?? sale.createdAt,
    endsAt: new Date(Date.now() + 320 * 24 * 3600 * 1000).toISOString(),
    status: "aktif",
  };
  const mem2: Membership = {
    id: "mem-2",
    companyId: companies[2].id,
    saleId: "sale-2",
    startsAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
    endsAt: new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString(),
    status: "suresi_bitti",
  };
  const sale2: Sale = {
    id: "sale-2",
    repId: null,
    companyId: companies[2].id,
    channel: "dogrudan",
    amount: settings.membershipPrice,
    status: "odendi",
    createdAt: sale2Date(),
    confirmedAt: sale2Date(),
  };
  const pay2: Payment = {
    id: "pay-2",
    saleId: sale2.id,
    amount: sale2.amount,
    provider: "hicbiri",
    providerRef: "DEMO-REF-0002",
    status: "onaylandi",
    idempotencyKey: "demo-key-2",
    createdAt: sale2.createdAt,
    updatedAt: sale2.confirmedAt ?? sale2.createdAt,
  };

  const referrals: Referral[] = [
    { id: "ref-1", code: "KADINANA-1001", repId: "rep-1", createdAt: now },
    { id: "ref-2", code: "IRMK-1002", repId: "rep-2", createdAt: now },
  ];

  // Örnek adaylar (sahada toplama sürecini göstermek için)
  const leads: Lead[] = [
    {
      id: "lead-1",
      repId: "rep-1",
      companyName: "Esentepe Pastanesi (aday)",
      categoryId: cats[0].id,
      cityId: city.id,
      district: "Merkez",
      phone: "0533 000 11 22",
      note: " Kurtuluş mahallesinde yeni açılmış; sahibi haftaya bilgi için gelecek.",
      status: "görüşme",
      visitCount: 2,
      createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: "lead-2",
      repId: "rep-2",
      companyName: "Bolvadin Moult Autotamir (aday)",
      categoryId: cats[2].id,
      cityId: city.id,
      district: "Bolvadin",
      phone: "0533 000 33 44",
      note: "Fiyat hassasiyeti yüksek; 2026 ilkbahar kampanyasında summer düşünelim.",
      status: "irtibat",
      visitCount: 1,
      createdAt: new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const visits: LeadVisit[] = [
    {
      id: "visit-1",
      leadId: "lead-1",
      repId: "rep-1",
      date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      note: "İlk ziyaret; katalogtan bilgi ve fiyat sunduk.",
      outcome: "Sahibi düşünüyor",
    },
    {
      id: "visit-2",
      leadId: "lead-1",
      repId: "rep-1",
      date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      note: "Yeniden aradım; kapı kapı tabloya specta değişikliği istedi.",
      outcome: "Tekrar irtibat",
    },
  ];

  const users = demoUsers();

  return {
    categories: cats,
    cities: [city],
    companies,
    reps,
    leads,
    visits,
    sales: [sale, sale2],
    payments: [payment, pay2],
    memberships: [membership, mem2],
    commissions: [
      {
        id: "com-1",
        saleId: sale.id,
        repId: "rep-1",
        type: "satis",
        amount: settings.repCommission,
        status: "beklemede",
        createdAt: sale.confirmedAt ?? sale.createdAt,
      },
    ],
    referrals,
    settings,
    audit: [],
    // kullanıcı listesi DB içinde değil; demoUsers ayrı tutuluyor
    ...({ users } as unknown as Record<string, never>),
  };
}

function sale2Date(): string {
  return new Date(Date.now() - 405 * 24 * 3600 * 1000).toISOString();
}

export function demoUsers(): AppUser[] {
  return [
    {
      id: "user-admin",
      name: "Platform Yöneticisi",
      email: "admin@demo.com",
      role: "admin",
    },
    { id: "user-1", name: "Ayşe Yılmaz", email: "ayse@demo.com", role: "temsilci", repId: "rep-1" },
    { id: "user-2", name: "Mehmet Demir", email: "mehmet@demo.com", role: "temsilci", repId: "rep-2" },
  ];
}
