# Ekran Zamanı

Günlük uygulama kullanımını otomatik takip eden basit bir masaüstü uygulaması (Electron).
Hangi uygulamada ne kadar vakit geçirdiğini gösterir. **Tüm veriler yalnızca senin bilgisayarında** saklanır — hiçbir yere gönderilmez.

<img width="1920" height="1080" alt="ekran-zamani-linkedin" src="https://github.com/user-attachments/assets/5e390ab8-d67d-4318-bd48-ed6b48f20217" />


## Kurulum

**[⬇️ Windows için indir](https://github.com/gamzesirin/ekranzamani/releases/tag/v1.1.1)**

1. Açılan sayfadan `EkranZamani-Setup-x.x.x.exe` dosyasını indir ve çalıştır.
2. Windows "Windows kişisel bilgisayarınızı korudu" uyarısı gösterirse **Ek bilgi → Yine de çalıştır**'a tıkla (uygulama dijital olarak imzalı olmadığı için çıkar).
3. Kurulum sihirbazını tamamla; masaüstünde ve başlat menüsünde "Ekran Zamanı" kısayolu oluşur.

## Özellikler

- Aktif pencereyi otomatik algılar (Windows API üzerinden, native modül gerektirmez)
- Sen boştayken (60 sn hareketsizlik) süreyi saymaz → gerçekçi veri
- Gün gün gezinme + son 7 günün mini grafiği
- Sistem tepsisinde (tray) arka planda çalışır
- Tek tıkla takibi duraklat / sürdür
- Kullanım raporunu CSV olarak dışa aktar (Excel'de açılır, UTF-8 + `;` ayraç)
- Veriler lokal JSON'da (`%APPDATA%/ekran-zamani/usage-data.json`)

## Gereksinimler

- Windows (izleyici PowerShell + Win32 API kullanır; macOS/Linux desteklenmez)
- Node.js + npm (geliştirme ve derleme için)

## Çalıştırma (geliştirme)

```bash
npm install
npm start
npm run icon      # assets/icon.png ve assets/icon.ico dosyalarını yeniden üretir (isteğe bağlı)
```

## Kurulabilir .exe üretme

```bash
npm run dist      # dist/EkranZamani-Setup-1.0.0.exe (NSIS kurulum sihirbazı)
npm run pack      # sadece paketle, kurulum yapma (dist/win-unpacked/)
```

Kurulum dosyası çift tıklanınca sihirbaz açılır: kurulum klasörü seçilebilir, masaüstü
ve başlat menüsü kısayolu ("Ekran Zamanı") oluşturur. Kaldırma için Windows "Uygulamalar"
listesinden "Ekran Zamani" kaldırılabilir.

## Nasıl çalışır?

- `scripts/tracker.ps1` — PowerShell + Win32 API ile her 4 sn'de bir aktif pencereyi ve boşta kalma süresini JSON olarak yazar.
- `tracker.js` — bu çıktıyı dinler, geçen süreyi aktif uygulamaya ekler.
- `store.js` — veriyi gün gün lokal JSON dosyasında tutar.
- `renderer/` — arayüz (özet, gün navigasyonu, haftalık grafik, uygulama listesi).

## Dosya yapısı

```
screen-monitoring-app/
├── main.js              # Electron ana süreç (pencere, tray, IPC)
├── preload.js           # Güvenli IPC köprüsü
├── tracker.js           # İzleyici (PS çıktısını işler)
├── store.js             # Lokal veri saklama
├── generate-icon.js     # Uygulama ikonu üretici (icon.png + icon.ico)
├── assets/              # İkonlar (pencere, tray, kurulum dosyası)
├── scripts/tracker.ps1  # Aktif pencere + idle okuyucu
└── renderer/            # Arayüz (html/css/js)
```
