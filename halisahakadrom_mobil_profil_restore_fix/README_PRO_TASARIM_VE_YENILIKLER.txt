HalıSahaKadrom PRO - Tasarım ve Özellik Güncellemesi

Bu paket rules tarafına dokunmadan, ücretsiz Firebase kullanımı korunarak hazırlanmıştır.

Uygulama sırası:
1) Tasarım yenileme
- Koyu modern spor teması
- Cam efektli panel/kart sistemi
- Gelişmiş sayfalar için hero başlık alanları
- Mobil alt menüye Pro bölümü
- Oyuncu/istatistik kartlarında daha okunur ve premium görünüm
- Responsive düzen ve düşük hareket tercihi desteği

2) Performans iyileştirmeleri
- Büyük liste alanlarına content-visibility desteği
- Gelişmiş sayfalarda mevcut CACHE verisi kullanımı
- Ekstra Firestore write oluşturulmadı
- Service worker cache versiyonu yenilendi
- UI override sistemi mevcut fonksiyonları bozmadan eklendi

3) Yeni gelişmiş özellikler
- Oyuncu Karşılaştırma sayfası
- Haftanın Yıldızları sayfası
- Maç Özeti sayfası
- Gelişmiş dashboard kısayolları
- Akıllı Kadro / Form / Chemistry / Market / Rozet / Turnuva ekranları modernleştirildi

Notlar:
- Firestore rules değiştirilmedi.
- Sosyal akış yerel depolamada bırakıldı; rules aşamasında Firestore'a taşınabilir.
- Özellikler mevcut CACHE.players, CACHE.ratings, CACHE.ga ve CACHE.winners verileriyle çalışır.
- Hosting'e atmadan önce eski service worker cache'i yüzünden tarayıcıda hard refresh veya uygulama cache temizliği gerekebilir.
