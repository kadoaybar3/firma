/**
 * Kategori adından Lucide ikonu seçer.
 *
 * Veritabanındaki kategori adları Türkçe ve serbest metin; ikon alanı emoji
 * içeriyordu. Emoji ağırlıklı görünüm yerine tek çizgi dili kullanılır:
 * anahtar kelime → ikon eşlemesi. Sıra önemlidir; özel kurallar genel
 * kurallardan önce gelir ("Oto Yıkama" otomotive, "Kuru Temizleme"
 * çamaşırhaneye düşer). Eşleşme yoksa nötr `Tag`.
 */
import {
  Baby,
  Banknote,
  Beef,
  BookOpen,
  Brain,
  Briefcase,
  Bug,
  Building2,
  CakeSlice,
  Calculator,
  Camera,
  Car,
  Coffee,
  Droplets,
  Dumbbell,
  Factory,
  Film,
  Fish,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  Hammer,
  HardHat,
  HeartPulse,
  Home,
  Hotel,
  KeyRound,
  Landmark,
  Laptop,
  MapPin,
  Megaphone,
  Mountain,
  Paintbrush,
  PanelsTopLeft,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  Printer,
  Recycle,
  Ruler,
  Salad,
  Scale,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Tag,
  Tractor,
  TreePine,
  Truck,
  Users,
  UtensilsCrossed,
  Warehouse,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { normalizeSearch } from "../lib/slug";

const RULES: Array<[RegExp, LucideIcon]> = [
  // Otomotiv — "tamir" tek başına yeterli değil (beyaz eşya/tadilat da tamir)
  [/(^oto|oto |arac|galeri|ekspertiz|kaporta|cekici|lastik|aku|yedek parca)/, Car],
  [/(taksi|transfer)/, Car],

  // Yeme-içme
  [/(kafe|kahve|cay evi|nargile)/, Coffee],
  [/(restoran|lokanta|yemek|fast food|pizza|kebap|pide|bufe|kofte|corba|catering|doner)/, UtensilsCrossed],
  [/(pastane|firin|tatli|baklava|dondurma|kek|kurabiye)/, CakeSlice],
  [/(kasap|et ve et|et urun)/, Beef],
  [/(market|bakkal|manav|sarkuteri|kuruyemis)/, ShoppingBasket],
  [/(balik|deniz urun)/, Fish],

  // Sağlık
  [/(dis|agiz)/, HeartPulse],
  [/(hastane|klinik|doktor|saglik|tip merkezi|fizik tedavi|optik)/, Stethoscope],
  [/(eczane)/, Pill],
  [/(veteriner|pet|hayvan)/, PawPrint],
  [/(psikolog|terapist)/, Brain],
  [/(diyet|beslenme)/, Salad],

  // Güzellik / bakım
  [/(kuafor|berber|guzellik|estetik|spa|masaj|tirnak|makyaj|sac)/, Scissors],
  [/(kozmetik|parfum)/, Sparkles],

  // Eğitim
  [/(kres|anaokulu|cocuk)/, Baby],
  [/(okul|kurs|dershane|egitim|surucu|etut|universite)/, GraduationCap],

  // Profesyonel hizmetler
  [/(avukat|hukuk|noter|mevzuat)/, Scale],
  [/(muhasebe|mali musavir)/, Calculator],
  [/(isletme ve yonetim|sirket kurulus|danismanlik hizmet)/, Briefcase],
  [/(banka|sigorta|finans|kredi)/, Landmark],
  [/(danisman)/, Briefcase],
  [/(borsa|doviz)/, Banknote],
  [/(insan kaynak|ise alim)/, Users],

  // İnşaat / yapı / teknik
  [/(emlak|gayrimenkul|konut)/, Building2],
  [/(mimarlik|ic mimar)/, Ruler],
  [/(insaat|yapi|muteahhit|hafriyat|beton)/, HardHat],
  [/(pvc|cam|aluminyum)/, PanelsTopLeft],
  [/(mobilya|marangoz|ahsap|sofa)/, Sofa],
  [/(boya|badana|alcipan)/, Paintbrush],
  [/(elektrik|aydinlatma)/, Zap],
  [/(tesisat|su tesisati|dogalgaz|kombi|izolasyon|su kacak)/, Droplets],
  [/(isitma|soba|kazan)/, Flame],
  [/(beyaz esya|ev alet)/, WashingMachine],
  [/(cilingir|anahtar)/, KeyRound],

  // Ulaşım / konaklama
  [/(nakliye|kargo|lojistik|tasima|evden eve)/, Truck],
  [/(depolama|depo)/, Warehouse],
  [/(otel|pansiyon|konaklama|apart)/, Hotel],
  [/(seyahat|acente|ucak|gezi|tur )/, Plane],

  // Güvenlik
  [/(guvenlik|guvenli|alarm)/, ShieldCheck],

  // Ticaret / teknoloji
  [/(giyim|tekstil|konfeksiyon|moda|ayakkabi|kundura|canta|terzi)/, Shirt],
  [/(bilgisayar|dizustu|laptop)/, Laptop],
  [/(telefon|teknoloji|bilisim|yazilim|internet|elektronik)/, Smartphone],
  [/(fotograf|studyo)/, Camera],
  [/(video|produksiyon|film)/, Film],
  [/(matbaa|baski)/, Printer],
  [/(reklam|pazarlama|seo|sosyal medya|tabela|ajans)/, Megaphone],
  [/(cicek|florist|bitki)/, Flower2],
  [/(peyzaj|bahce|tohum|fide|kamp|doga)/, TreePine],
  [/(tarim|ciftlik)/, Tractor],
  [/(dugun|davet|etkinlik|parti|organizasyon|salon)/, PartyPopper],
  [/(kuyumcu|altin|mucevher|saat)/, Gem],
  [/(hediyelik|hediye|oyuncak|aksesuar)/, Gift],

  // Sanayi
  [/(metal|kaynak)/, Hammer],
  [/(fabrika|uretim|sanayi)/, Factory],
  [/(mermer|dogal tas)/, Mountain],
  [/(geri donusum)/, Recycle],

  // Diğer hizmetler
  [/(ilaclama|hasere)/, Bug],
  [/(camasi|kuru temizleme)/, WashingMachine],
  [/(temizlik|hijyen)/, Sparkles],
  [/(spor|fitness|hali saha|yuzme|pilates|yoga)/, Dumbbell],
  [/(eglence|oyun|aktivite)/, Gamepad2],
  [/(kitap|kirtasiye|yayin)/, BookOpen],
  [/(tamirat|tadilat|tamir|bakim|servis)/, Wrench],
  [/(harita|konum|adres)/, MapPin],
  [/(cenaze|mezarlik)/, Home],
];

export function categoryIcon(name: string): LucideIcon {
  const n = normalizeSearch(name);
  for (const [re, Icon] of RULES) {
    if (re.test(n)) return Icon;
  }
  return Tag;
}

/** Kategori için tek çizgi ikon (18px varsayılan, currentColor). */
export function CategoryGlyph({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = categoryIcon(name);
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
