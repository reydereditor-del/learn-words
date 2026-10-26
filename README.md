# So‘z Orbitasi

Nemischa, inglizcha va ruscha so‘zlarni o‘zbekcha interfeysda o‘rganish uchun brauzer ilovasi. React, TypeScript va Vite. Backend, login, tashqi AI/API yoki oldindan yuklangan lug‘at yo‘q.

## Ishga tushirish

Node.js 22+ (Node.js 24 bilan tekshirilgan) va npm kerak.

```sh
npm ci
npm run dev
```

Vite standart 5173-portda ishlaydi. Boshqa port uchun `npm run dev -- --port 3000` ishlating.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Brauzer testlari uchun Chromium kerak. Bulut muhitida `/usr/bin/chromium` mavjud. Boshqa joyda `CHROMIUM_PATH` orqali yo‘lni bering yoki `npx playwright install chromium` ishlating.

```sh
npm run test:e2e
```

## Asosiy jarayon

1. **Import** orqali til, daraja va to‘plam nomini tanlang.
2. Tayyor promptni nusxalab, so‘zlar ro‘yxati yoki PDF bilan tashqi AI’ga bering.
3. JSON javobini joylang. Oddiy JSON va Markdown JSON kod bloki qabul qilinadi.
4. Qatorlarni tekshiring yoki tahrirlang. Takroriy so‘zlarni o‘tkazib yuboring yoki tarixini saqlagan holda yangilang.
5. Tarjimadan yozish yoki gapdagi bo‘shliq mashqini boshlang.

So‘z va tarjima majburiy. Gap mashqiga `sentence`, `sentenceTranslation`, aynan bitta `{{blank}}` markerli `clozeText` va kamida bitta `clozeAnswers` javobi kerak. Yetarli ma’lumot bo‘lmasa so‘z tarjima mashqida qoladi. Saqlangan javoblar katta-kichik harfni farqlamasdan tekshiriladi. Artikl, umlaut, ß va boshqa harf farqlari saqlanadi; noaniq o‘xshash javoblar avtomatik to‘g‘ri hisoblanmaydi.

Takrorlash 1, 3, 7, 14 va 30 kunlik intervallarda ishlaydi. Faqat birinchi mustaqil to‘g‘ri javob bosqichni oshiradi. Yordam va “qiynaldim” bosqichni oshirmaydi; xato va javobni ochish bosqichni qayta boshlaydi. Tarjima va gap mashqi jadvallari alohida. Raunddagi xatolar cheklangan marta qaytadi.

## Ma’lumot va zaxira

Barcha to‘plamlar, so‘zlar, tarix, jadvallar va tugallanmagan raund **IndexedDB**’da saqlanadi. Har javobdan keyin yozuv tranzaksiyasi yakunlanishi kutiladi. Sahifani yangilab, bosh ekrandagi **Davom ettirish** orqali raundni davom ettiring.

Sarlavhadagi `…` menyusi orqali barcha ma’lumotlarni versiyali JSON zaxirasiga eksport qiling yoki zaxiradan tiklang. Tiklash faylni to‘liq tekshiradi va mavjud ma’lumotni almashtirishdan oldin tasdiq so‘raydi. Brauzer ma’lumotlari tozalansa, mahalliy lug‘at ham yo‘qoladi. Qurilmalar orasida avtomatik sinxronlash yo‘q.

Animatsiyani kamaytirish shu menyuda. Tizimning `prefers-reduced-motion` tanlovi ham qo‘llanadi. Mashq paytida orbita va fon animatsiyasi ishlamaydi.

## Loyiha tuzilishi

- `src/lib/import.ts` — JSON tekshirish, AI prompti, takrorlarni aniqlash va yangilash.
- `src/lib/study.ts` — javoblar, takrorlash jadvali va cheklangan sessiya navbati.
- `src/lib/storage.ts` — IndexedDB tranzaksiyalari va to‘liq zaxira tekshiruvi.
- `src/components/` — import, to‘plam, CSS 3D orbita va mashq/natija ko‘rinishlari.
- `tests/*.test.ts` — muhim mantiq va IndexedDB testlari.
- `tests/*.spec.ts` — real Chromium’da asosiy jarayon va moslashuv testlari.

Ilova tarmoq xizmati yoki maxfiy kalit talab qilmaydi. Ishlab chiqarish uchun `dist/` jildini statik hostingga joylashtirish yetarli; localStorage yoki server orqali yashirin sinxronlash yo‘q.

## Bitta tayyor HTML fayl

```sh
npm run build:standalone
```

`dist/soz-orbitasi.html` faylida barcha JavaScript, CSS va belgi birga joylashadi. Faylni yuklab olib, kompyuterdagi Chrome brauzerida ochish mumkin; Node.js yoki serverni ishga tushirish talab qilinmaydi. HTML faylning o‘zi so‘zlarni o‘z ichiga olmaydi — foydalanuvchi ma’lumotlari brauzer IndexedDB xotirasida qoladi. Brauzerni yoki fayl joylashuvini o‘zgartirishdan oldin zaxira oling.

Bitta faylli build Chromium’da HTTP orqali tekshirildi: tashqi resurslarsiz ochilish, internet uzilganda import va mashq, refresh’dan keyin davom ettirish va zaxira eksporti. Bulut brauzeri siyosati `file://` navigatsiyasini bloklagani sabab shu muhitda faylni to‘g‘ridan-to‘g‘ri ochish tekshirilmagan.

## GitHub Pages

`.github/workflows/deploy-pages.yml` main tarmog‘iga push qilinganda test va buildni bajarib, GitHub Pages’ga joylashtiradi. Vite nisbiy asset manzillarini ishlatadi, shuning uchun `/learn-words/` ostida ham ochiladi. GitHub repozitoriysida **Settings → Pages → Source → GitHub Actions** tanlangan bo‘lishi kerak. Workflow Pages’ni avtomatik yoqishga ham urinadi; token ruxsati yetmasa, Source sozlamasini repozitoriy egasi bir marta tanlaydi.

1.0.1 tuzatishi: keyingi savolga o‘tish 300 ms taymer bilan to‘sib qo‘yilmaydi. Enter’ni ushlab turish va sichqonchaning ikki marta bosilishi alohida tekshiriladi. Kamaytirilgan animatsiya yoqilgan bo‘lsa, bosh ekranda sabab ko‘rinadi.

1.0.2 tuzatishi: qurilmaning kamaytirilgan animatsiya sozlamasi sukut bo‘yicha hurmat qilinadi, lekin foydalanuvchi saytda “To‘liq animatsiya”ni aniq tanlasa, bu tanlov ustun bo‘ladi. Tanlov saqlanadi va “Qurilma sozlamasiga qaytish” bilan bekor qilinadi. Checkbox haqiqiy holatni ko‘rsatadi. Kartalar scroll davomida chuqurlik bo‘ylab aylana yo‘lida aylanib, keyin qatorlarga yig‘iladi; bir so‘zli to‘plamda ham harakat aniq ko‘rinadi.

1.0.3 tuzatishi: sichqonchaning diskret scroll qadamlariga to‘g‘ridan-to‘g‘ri sakrash o‘rniga, vaqtga bog‘liq `requestAnimationFrame` yumshatishi qo‘llanadi. Kadrlar faqat transform/opacity’ni yangilaydi; butun React orbita komponenti har kadrda qayta render qilinmaydi. Harakat tugaganda kadr sikli to‘xtaydi, kamaytirilgan animatsiyada esa statik ko‘rinish saqlanadi. Bitta wheel qadamidan keyingi oraliq kadrlar brauzer testida tekshiriladi.

1.0.4: fon `#111315`, to‘plam kartalari `#1C2024`, yordamchi matnlar `#A9B1BA`; elektr yashil `#BDFF62` asosiy amallar va faol holatlar uchun saqlandi. To‘plamlar ko‘rinish maydoniga kirganda bir marta 12 px yengil ko‘tarilib ochiladi. Tanlangan karta → to‘plam → mashq o‘tishida 220 ms shared-surface animatsiyasi mavjud. View Transitions qo‘llanmasa yoki animatsiya kamaytirilgan bo‘lsa, oddiy ishlaydigan o‘tish saqlanadi. Mashq ichidagi savol va input uchun doimiy harakat qo‘shilmagan.

1.1.0: nemischa, inglizcha va ruscha import, filtrlar, yozma/gap mashqlari va zaxira qo‘llanadi. Javoblar katta-kichik harfdan qat’i nazar qabul qilinadi (`die Informatik` = `die informatik`), lekin artikl, umlaut, ß va ruscha ё/е farqlari saqlanadi. Ruscha prompt kirill yozuvidagi so‘zlarni tayyorlaydi; mashqda ё/Ё kiritish tugmalari bor. Oldingi tarix qayta yozilmaydi; eski qoidalar bilan xato saqlangan ochiq javoblar uchun tushuntirish ko‘rsatiladi.
