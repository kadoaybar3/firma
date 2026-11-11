/**
 * AFYONKARAHİSAR MAHALLELERİ — ilçe → mahalle adları.
 * Kaynak: turkiye-api v2 static dataset
 * (2025; MIT lisansı, github.com/ubeydeozdmr/turkiye-api).
 * Doğrulama: datasets/2025/neighborhoods.json içindeki provinceId=3 kayıtları;
 * 18 ilçe, 362 mahalle kaydı (245 benzersiz ad). Diğer iller için resmi mahalle
 * seti bu projeye dahil edilmedi; formda mevcut firma adreslerinden öneri +
 * elle giriş kullanılır.
 */
export const TR_MAHALLELERI: Record<string, Record<string, string[]>> = {
  Afyonkarahisar: {
    "Bayat": ["Büyük", "Cumhuriyet", "Hürriyet", "Yeni"],
    "Başmakçı": ["Aşağı Hilal", "Barbaros", "Fatih", "Gülistan", "Mimar Sinan", "Yeni", "Yukarı Hilal", "Çağlayan"],
    "Bolvadin": ["Akçeşme", "Alaca", "Bademli", "Bahçelievler", "Bağlarbaşı", "Bağlarüstü", "Bucak", "Cirit", "Emrullah", "Erkmen", "Ethem Kelekçi", "Fatih", "Gökçeyayla", "Gölbaşı", "Hacı Halife", "Hacı Ömer", "Hisar", "İhsaniye", "Karabağ", "Kaymaz", "Konak", "Köprübaşı", "Kırkgöz", "Lala Sinan Paşa", "Malazgirt", "Mevlana", "Müslümana", "Okul", "Selçuklu", "Taşağıl", "Ulucami", "Yakup Şevki Paşa", "Yavuz Selim", "Yeni", "Yenice", "Yukarı", "Yunus Emre", "Çaybaşı", "Üsküdar", "Şehirönü", "Şeyh Şamil", "Şıhlar"],
    "Dazkırı": ["Barbaros", "Esentepe", "Kurtuluş", "Yeniyol", "Yeşilyurt", "Çamlık"],
    "Dinar": ["Adliye", "Altmışevler", "Altınhisar", "Atatürk", "Bağlar", "Camikebir", "Cumhuriyet", "Dörtyol", "Emniyet", "Fatih", "Gazi Mehmet Çavuş", "Hürriyet", "Ilıca", "İncirli", "İstasyon", "İstiklal", "İtfaiye", "Konak", "Korubaşı", "Merkez", "Ocaklı", "Otogar", "Pancar", "Pazar", "Pınarbaşı", "Sanayi", "Santral", "Stadyum", "Suçıkan", "Toptepe", "Yeni", "Yeşilyurt", "Çamlıca", "Çağlayan", "Örnek", "Üçlerce"],
    "Emirdağ": ["Adaçal", "Alasakallı", "Aziziye", "Bağlarbaşı", "Cumhuriyet", "Domurlu", "Dörtyol", "Emirbaba", "Eski Kacerli", "Fatih", "Gökçeyaka", "Hisarköy", "İncik", "İncili", "İnkilap", "Karakuyu", "Karşıyaka", "Menderes", "Sofulu", "Toki", "Yeni", "Yeni Kacerli", "Yenidoğan", "Çilli"],
    "Evciler": ["Camikebir", "Fatih", "Kayalık", "Mehmet Akif", "Yavuz Selim", "Yunus Emre"],
    "Hocalar": ["Hürriyet", "Yeni", "Şafak"],
    "İhsaniye": ["Akören", "Atatürk", "Bahçelievler", "Belce", "Cumhuriyet", "Esentepe", "Fatih", "Hürriyet", "Kervansaray", "Kunduzlu", "Pınar", "Susuz Osmaniye", "Türbe", "Yeni", "Yenikent", "Yunus Emre", "Zafer", "Şahinler"],
    "İscehisar": ["Cumhuriyet", "Esentepe", "Eski Hamam", "Fatih", "Hasan Basri", "Kavak", "Kurtuluş", "Medrese", "Selçuklu", "Tepecik", "Zeybek", "Çukur", "Şirinevler"],
    "Kızılören": ["Cumhuriyet", "Yeni"],
    "Merkez": ["Akmescit", "Akçin", "Ali İhsan Paşa", "Ali Çetinkaya", "Altındağ", "Ataköy", "Atatürk", "Barbaros", "Battalgazi", "Bayatcık", "Beyazıt", "Burmalı", "Cumhuriyet", "Dairecep", "Demirçevre", "Derviş Paşa", "Dumlupınar", "Dörtyol", "Erenler", "Ertuğrul Gazi", "Esentepe", "Eşrefpaşa", "Fakıpaşa", "Fatih", "Fevzi Çakmak", "Gazi", "Gökhan", "Gültepe", "Gümüş Tepe", "Güvenevler", "Halil İbrahim Sultan", "Hamidiye", "Hasan Karaağaç", "Hattat Karahisar", "Hisar", "Hoca Ahmet Yesevi", "Huzur", "Hürriyet", "İsmail", "İstiklal", "Kanlıca", "Karaman", "Karşıyaka", "Kasımpaşa", "Kayadibi", "Kocatepe", "Kurtuluş", "Kışlacık", "Mareşal Fevzi Çakmak", "Marulcu", "Mecidiye", "Mehmet Akif", "Nazmi Saatçi", "Olucak", "Orhangazi", "Osman Gazi", "Osmanlı", "Sadıkbey", "Sahipata", "Sakarya", "Selçuklu", "Sümer", "Tacı Ahmet", "Taşpınar", "Ulucami", "Uğur", "Veysel Karani", "Yaka", "Yarenler", "Yavuz Selim", "Yeni", "Yenice", "Yeşilyurt", "Yunus Emre", "Yunuslar", "Zafer", "Çakır", "Örnek", "Örnekevler", "Şehit Ahmet", "Şeker"],
    "Sandıklı": ["Cuma", "Dikmen", "Ece", "Fatih", "Hisar", "İstasyon", "Kevser", "Sazak", "Tapduk Emre", "Yunus Emre", "Zafer", "Çakır", "Çay", "Çiğiltepe", "Şirinevler"],
    "Sinanpaşa": ["Akpınar", "Ali Çetinkaya", "Ambar", "Atatürk", "Aşağı", "Bahçelievler", "Bağdat", "Cumhuriyet", "Dibekbaşı", "Fatih", "Fevzi Çakmak", "Gölcük", "Halkalı", "Hisar", "Hozman", "Hürriyet", "Işık", "Kocatepe", "Kurtuluş", "Köprübaşı", "Kümbet", "Küçüktepe", "Orta", "Saray", "Yavuz Sultan Selim", "Yeni", "Yukarı", "Yıldırım Beyazıt", "Zafer", "Çalışlar", "Çankaya", "Çiğiltepe", "Çınarlı", "Öğretmenler"],
    "Sultandağı": ["Akpınar", "Atatürk", "Aşağı", "Camikebir", "Cumhuriyet", "Karaman", "Kavaklı", "Kayran", "Pazaraltı", "Selçuk", "Sıra", "Tepebaşı", "Yeni", "Yenikent", "Yukarı", "Yıldırım", "Yıldız", "Çavuş"],
    "Çay": ["Afyon", "Aktaş", "Ali İhsan Paşa", "Ali Kaleli", "Aşağı", "Bahçelievler", "Bağlar", "Beşevler", "Cedit", "Demirağaç", "Dumlupınar", "Elbiz", "İstasyon", "Karabulut", "Köprübaşı", "Orta", "Seka", "Tekke", "Vakıf", "Yaka", "Yeşilevler", "Yukarı", "Şirinevler"],
    "Çobanlar": ["Atatürk", "Bucak", "Cumhuriyet", "Fatih", "Gölcük", "Işık", "İstiklal", "Karadede", "Sırakapı", "Termalkent", "Yavuz Selim", "Yeni", "Zafer"],
    "Şuhut": ["Altıgöz", "Baş", "Develi", "Erenler", "Gazipaşa", "Hacı Musa", "Hisar", "İplik", "İstiklal", "Kurtuluş", "Mehmet Akif Ersoy", "Pazar", "Taşlıca", "Yalı", "Zafer", "Çağlayan"],
  },
};
