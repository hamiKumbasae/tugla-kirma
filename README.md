# Tuğla Kırma

**▶ Oyna:** https://hamikumbasae.github.io/tugla-kirma/

Tarayıcıda çalışan, bağımlılıksız bir tuğla kırma (Breakout) oyunu. Kurulum veya derleme gerekmez: `index.html` dosyasını açman yeterli.

## Modlar

- **Klasik:** Kolaydan zora sıralanmış 30 şekil bölümü (Başlangıç, Orta, Zor).
- **Tarih:** MÖ 220'den 1939'a 64 bölümlük kronolojik kampanya. Tuğlalar olayın yılını yazar ve her bölümden önce olayla ilgili kısa bir not gösterilir. Bölümler beş çağa ayrılır: İlk Türk Devletleri, Türk-İslam Devletleri ve Selçuklular, Osmanlı (Kuruluş ve Yükseliş), Osmanlı (Zirve ve Değişim), Meşrutiyet'ten Cumhuriyet'e.

Her modda top hızı bölüm ilerledikçe artar, raket daralır. Tamamlanan bölümler tarayıcıda saklanır ve listede ✓ ile işaretlenir.

## Kontroller

| Eylem | Klavye | Fare / dokunma | Oyun kolu |
|---|---|---|---|
| Raketi hareket ettir | ← → | Fareyi / parmağını kaydır | Sol çubuk, yön tuşları |
| Topu at, menüde onayla | Boşluk / Enter | Tıkla / dokun | A (✕) |
| Duraklat | Esc / P | — | Start |

**Güçlendirmeler:** W geniş raket · M çoklu top · S yavaşlatma · + bonus puan

## Dosya yapısı

```
index.html            Sayfa iskeleti ve menüler
css/style.css         Görünüm
js/audio.js           Kodla üretilen ses efektleri
js/patterns.js        Tuğla desenleri ve yıl rakamlarının piksel fontu
js/levels/classic.js  Klasik mod bölümleri
js/levels/history.js  Tarih modu bölümleri ve olay notları
js/game.js            Oyun motoru, girişler, menü akışı
```

Yeni bir bölüm eklemek için ilgili `js/levels/*.js` dosyasına bir satır eklemen yeterli.
