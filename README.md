# Tuğla Kırma

**▶ Oyna:** https://hamikumbasae.github.io/tugla-kirma/

Tarayıcıda çalışan, bağımlılıksız bir tuğla kırma (Breakout) oyunu. Kurulum veya derleme gerekmez: `index.html` dosyasını açman yeterli.

## Modlar

- **Klasik:** Kolaydan zora 120 bölüm, 9 dünya. İlk üç dünya (Başlangıç, Orta, Zor) şekillerden oluşur; sonraki her dünya yeni bir tuğla türü tanıtır (Taş Tuğlalar, Demir Duvarlar, Patlayıcılar, Anahtar ve Kilit, Kayan Sıralar), son dünya (Büyük Karışım) hepsini birleştirir.
- **Tarih:** MÖ 220'den 1939'a 64 bölümlük kronolojik kampanya. Tuğlalar olayın yılını yazar ve her bölümden önce olayla ilgili kısa bir not gösterilir. Bölümler beş çağa ayrılır: İlk Türk Devletleri, Türk-İslam Devletleri ve Selçuklular, Osmanlı (Kuruluş ve Yükseliş), Osmanlı (Zirve ve Değişim), Meşrutiyet'ten Cumhuriyet'e.

Her modda top hızı bölüm ilerledikçe artar, raket daralır. Tamamlanan bölümler tarayıcıda saklanır ve listede ✓ ile işaretlenir.

## Kontroller

| Eylem | Klavye | Fare / dokunma | Oyun kolu |
|---|---|---|---|
| Raketi hareket ettir | ← → | Fareyi / parmağını kaydır | Sol çubuk, yön tuşları |
| Topu at, menüde onayla | Boşluk / Enter | Tıkla / dokun | A (✕) |
| Duraklat | Esc / P | — | Start |

**Güçlendirmeler:** W geniş raket · M çoklu top · S yavaşlatma · + bonus puan

## Tuğla türleri

| Tuğla | Görünüm | Davranış |
|---|---|---|
| Normal | Renkli | Tek vuruşta kırılır |
| Taş | Bej, çatlaklı | Üç vuruşta kırılır; her vuruşta çatlaklar büyür |
| Demir | Gri, perçinli | Kırılmaz; bölümü bitirmek için kırılması gerekmez |
| TNT | Kırmızı | Kırılınca çevresindeki 8 tuğlayı yok eder, zincirleme patlar |
| Anahtar | Altın | Hepsi kırılınca kilitler açılır |
| Kilit | Mor, kilit simgeli | Anahtarlar bitene kadar kırılmaz |

Bazı bölümlerde sıralar sağa sola kayar.

## Dosya yapısı

```
index.html            Sayfa iskeleti ve menüler
css/style.css         Görünüm
js/audio.js           Kodla üretilen ses efektleri
js/patterns.js        Tuğla desenleri ve yıl rakamlarının piksel fontu
js/levels/classic.js  Klasik mod bölümleri (şekil desenleri ve metin haritaları)
js/levels/history.js  Tarih modu bölümleri ve olay notları
js/game.js            Oyun motoru, girişler, menü akışı
```

Yeni bir bölüm eklemek için ilgili `js/levels/*.js` dosyasına bir kayıt eklemen yeterli. Klasik bölümler 10 sütunluk metin haritasıyla çizilir:

```js
{ name: "Kasa", map: [
  "I3######3I",   // . boş · # normal · 3 taş · I demir
  "I########I",   // T TNT · K anahtar · L kilit
  "II......II",
]},
```
