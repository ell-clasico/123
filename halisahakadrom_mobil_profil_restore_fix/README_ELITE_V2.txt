Halı Saha Kadrom — Elite V2 Güncellemesi

Bu paket rules değiştirmeden, ücretsiz Firebase kullanımını koruyarak gelişmiş özellikler ekler.

Eklenen gelişmiş modüller:
1. Elite Merkez
2. AI Takım Dengeleme
3. İleri İstatistik Motoru
4. Katılım Tahmini
5. Pro Lig Motoru
6. Gelişmiş Sosyal Akış
7. Akıllı Bildirim Merkezi

Teknik notlar:
- Yeni dosya: js/advanced-v2.js
- Değişen dosyalar: index.html, js/ui.js, style.css, service-worker.js
- Firestore rules değiştirilmedi.
- Yeni özelliklerin çoğu mevcut CACHE verileriyle client-side çalışır.
- Sosyal Pro paylaşımları şimdilik localStorage kullanır; Firestore maliyeti üretmez.
- Bildirimler server push değildir; PWA/local notification mantığıyla hazırlanmıştır.
- AI takım dengeleme, katılım işaretleyen oyuncular varsa onları baz alır; yoksa aktif oyuncu havuzundan hesaplar.

Kurulum:
1. ZIP'i aç.
2. Firebase Hosting'e yükle veya lokal server ile çalıştır.
3. Eski cache görünürse hard refresh yap veya uygulama verisini temizle.
