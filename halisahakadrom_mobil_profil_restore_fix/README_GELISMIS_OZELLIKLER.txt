HalısahaKadrom gelişmiş özellik paketi

Rules dosyalarına dokunulmadı.

Eklenenler:
- Gelişmiş menü: Form Analizi, Akıllı Kadro, Chemistry, Market Değeri, Rozetler, Turnuva, Sosyal, Bildirimler
- Oyuncu bazlı form skoru: gol + galibiyet + ortalama puan + OVR
- Market değeri: mevcut verilere göre otomatik tahmini değer
- Rozet sistemi: golcü, kazanan, GOAT adayı, duvar, roket, formda vb.
- Chemistry sistemi: birlikte kazanan oyuncu ikilileri
- Turnuva/lig tablosu: galibiyet, gol ve puandan otomatik sıralama
- Akıllı kadro analiz sayfası: oyuncu havuzu, bölge dengesi, form/OVR özeti
- Sosyal akış: şimdilik localStorage ile çalışır; Firestore rules aşamasında koleksiyona taşınabilir
- Bildirim merkezi: PWA/browser bildirim izni ve test bildirimi
- Dashboard form kutusu daha zengin metrik gösterir
- Oyuncu kartlarında form etiketi gösterilir

Performans / ücretsiz Firebase iyileştirmeleri:
- Oyuncu listesi render işleminde innerHTML += yerine tek seferde HTML basılır
- Gereksiz Firestore keep-alive periyodik read kaldırıldı
- Session sadece sessionStorage kullanır; tarayıcı kapanınca tekrar login gerekir
- file:// ortamında pushState hatası için koruma eklendi
- Service worker cache versiyonu güncellendi ve advanced.js statik cache'e eklendi

Not:
- Yeni özellikler mevcut players, ratings, ga, winners verilerini kullanır.
- Yeni Firestore koleksiyonları zorunlu tutulmadı; bu yüzden mevcut rules bozulmaz.
