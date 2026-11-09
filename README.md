# Moliya AI — shaxsiy moliya kundaligi

Google Keep'dagi erkin moliyaviy qaydlar o'rniga: **tez yoziladi, saqlash tugmasisiz real vaqtda saqlanadi, chala satr ham yo'qolmaydi**, keyin aniq statistika, nazorat va AI takliflari.

- **Stack:** Next.js 16 (App Router) · React 19 · Supabase (Auth + Postgres + Realtime) · Vercel
- **Arxitektura:** *local-first* — har o'zgarish avval qurilmada (localStorage) saqlanadi va darhol ko'rinadi, keyin fonda Supabase'ga yuboriladi. Internet bo'lmasa navbatda turadi, qaytganda yuboriladi. Shuning uchun kechikish va «qotish» yo'q.
- **Mustaqil (serversiz) ishlaydigan qismlar:** yozuv, parser, hisob-kitob, statistika, nazorat, eksport/import, qo'lda AI hisobot. Supabase'siz ham ishlaydi («mehmon» rejimi — faqat shu qurilmada).
- **Serverga bog'liq qismlar:** bulut saqlash va qurilmalararo sinxronizatsiya (Supabase), AI tahlil (`/api/ai`), MB kursi (`/api/rates`).

---

## 1. Tezkor ishga tushirish (lokal)

```bash
npm install
cp .env.example .env.local   # Supabase va AI kalitlarini kiriting (ixtiyoriy)
npm run dev                  # http://localhost:3000
npm test                     # parser va hisob-kitob testlari (54 ta)
```

`.env.local` bo'sh bo'lsa ham ilova ishlaydi (mehmon rejimi).

## 2. Supabase sozlash (bulut saqlash + telefon↔kompyuter)

Bepul planda 2 ta faol loyiha limiti bor. Yangi loyiha shart emas — jadvallar `moliya_` prefiksi bilan bo'lgani uchun **mavjud loyihangizga** (masalan, boshqa ilovangiz turgan loyihaga) xavfsiz qo'shiladi; auth foydalanuvchilari ham o'sha loyihaniki bo'ladi (RLS har kimga faqat o'z qatorlarini ko'rsatadi).

1. [supabase.com](https://supabase.com) → mavjud loyihani oching (yoki limit bo'lsa — yangi: region Frankfurt).
2. **SQL Editor** → `supabase/schema.sql` faylini to'liq yopishtiring → **Run**. Bu `moliya_accounts`, `moliya_notes`, `moliya_settings` jadvallari, RLS va Realtime'ni yaratadi; boshqa jadvallarga tegmaydi.
3. **Authentication → Providers → Email**: yoqilgan. Tezroq bo'lishi uchun *Confirm email* ni o'chirib qo'ysangiz, ro'yxatdan o'tgan zahoti kiriladi.
   - Google bilan kirish kerak bo'lsa: Google provider'ni sozlang va Vercel'da `NEXT_PUBLIC_ENABLE_GOOGLE=1` qo'ying.
4. **Authentication → URL Configuration**: *Site URL* = Vercel manzilingiz (`https://moliya-….vercel.app`), *Redirect URLs* ga ham shu manzilni qo'shing.
5. **Project Settings → API Keys** dan ikkita qiymatni oling:
   - `Project URL` (loyiha sahifasidagi **Copy → Project URL**) → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   Eski loyihalarda publishable kalit o'rniga **Legacy API Keys → anon** bo'lishi mumkin — u holda `NEXT_PUBLIC_SUPABASE_ANON_KEY` ga yozing. Kod ikkalasini ham qabul qiladi.
   **Secret key** (`sb_secret_...`) hech qachon `NEXT_PUBLIC_` o'zgaruvchiga yozilmaydi — u RLS'ni chetlab o'tadi.

## 3. GitHub + Vercel deploy

```bash
git init && git add -A && git commit -m "Moliya AI"
gh repo create moliya-ai --private --source=. --push     # yoki GitHub saytida repo yaratib, push qiling
```

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub repo'ni tanlang. Framework: Next.js (avtomatik).
2. **Environment Variables** ga `.env.example` dagi qiymatlarni kiriting (kamida ikkita `NEXT_PUBLIC_SUPABASE_*`).
3. **Deploy**. Har `git push` — avtomatik yangi deploy.
4. Telefonda: Chrome/Safari → sayt → «Bosh ekranga qo'shish» — ilova kabi ochiladi (PWA manifest bor).

## 4. Yozuv sintaksisi (Google Keep uslubi)

| Yozuv | Ma'nosi |
|---|---|
| `K -2 samokat` | K kartadan 2 000 so'm chiqim, toifa «samokat» |
| `N -24-12 obed` | jami 36 000 chiqim |
| `C +10000 = 10000 oylik` | kirim; `= 10000` — yozilgan qoldiq, hisob bilan solishtiriladi (farq → «tafovut») |
| `N = 212` | haqiqiy qoldiqni belgilash — **kirim emas**; oldingi hisob bilan farq alohida ko'rsatiladi |
| `C -> K 100` / `C-K 100` | hisoblararo o'tkazma |
| `Uy -1000 N ga` + `N +1000 Uydan` | o'tkazmaning ikki tomoni — **bir marta** hisoblanadi (juftlashadi) |
| `J +50` | Javohirning qarzi 50 ming oshdi (shaxs hisobi) |
| `K +2100 = 2114 J` | J qaytardi, K kartaga tushdi; keyin `J = 0` |
| `J = -18` | siz unga 18 ming qarzdorsiz |
| `07.11`, `20.08`, `7/11/2026` | sana sarlavhasi — keyingi satrlarga qo'llanadi (bir necha kunlik Keep matnini bitta yozuvga qo'yish mumkin) |
| `N -50$`, `N -$50`, `N -50 usd` | dollar — shu hisobning USD qoldig'i alohida yuritiladi |
| `N -30000 so'm`, `N -30k`, `N -2.5` | to'liq so'm, ming, kasr |
| `N -38 do'kon, non va sut` | vergul: toifa va izoh |
| `K -10 = 1059 ? Kamomat` | `?` — «tekshirish kerak» belgisi (hisobga kiradi, lekin ro'yxatda ajralib turadi) |

Qoidalar:
- Odatiy birlik: **1 = 1 000 so'm** (yozuv sozlamasida `1 = 1 so'm` ga o'zgartirish mumkin). 1 000 000+ raqam birliksiz yozilsa, ilova taxmin qilmaydi — «so'mda / ming so'mda» deb so'raydi.
- Hisob kodi tailda yolg'iz turgan so'z bo'lsa (`N ga`, `Uydan`, `J`) — o'tkazma ikkinchi tomoni. `uy uchun kiyim` kabi so'zlar o'tkazma emas.
- Noma'lum qisqartma bilan yozilgan satr saqlanadi, hisobga kirmaydi; keyin «hisob yaratish» yoki mavjud hisobga «bog'lash» mumkin.
- Chala (`N -`, `-30 taksi`) va noaniq satrlar saqlanadi, balans va statistikaga kirmaydi; to'ldirilganda bir marta hisoblanadi. Tahrir dublikat yaratmaydi (bir yozuv = bir ID).
- Xom matn hech qachon avtomatik o'zgartirilmaydi; tezkor tuzatish tugmalari faqat siz bosganda satrni almashtiradi.

## 5. AI akkauntiga ulanish — haqiqiy holat (tekshirilgan 2026-11-07)

| Provayder | Akkaunt/obuna orqali (Vercel veb-ilovada) | Rasmiy yo'l |
|---|---|---|
| **ChatGPT** | **Yo'q.** «Sign in with ChatGPT» mavjud, lekin: veb-saytlar uchun faqat tanlangan hamkorlarga cheklangan sinov (client ID OpenAI vakili orqali) va u faqat *identifikatsiya* beradi (ism/email), obunadan AI ishlatish emas. Obunadan foydalanish (token sharing) faqat ochiq kodli **lokal** dasturlar uchun: callback `http://127.0.0.1:…`, tokenlar foydalanuvchi qurilmasida. Vercel'dagi veb-ilova bunga mos kelmaydi. Manbalar: [siwc/website](https://developers.openai.com/siwc/website), [token-sharing sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/) | API kaliti: [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Claude** | **Yo'q.** Anthropic uchinchi tomon ilovalarga claude.ai login va Free/Pro/Max obuna hisobidan so'rov yuborishni taqiqlaydi (2026-02 hujjat, serverda bloklanadi). Manba: [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) | API kaliti: [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Gemini** | **Yo'q.** Google AI Pro/Ultra obunasini tashqi ilovada ishlatish dasturi yo'q («API va tashqi ilovalar alohida hisoblanadi»). Manba: [Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans) | API kaliti (bepul tarif bor): [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Shuning uchun ilovada **«akkaunt bilan ulandi» holati yo'q va taqlid qilinmaydi**. Amalga oshirilgani:

1. **Rasmiy API orqali avtomatik tahlil** (`/api/ai`, server tomonida, web-qidiruv bilan): OpenAI Responses `web_search`, Anthropic `web_search` tool, Gemini `google_search`. Natija JSON: xulosa, takliflar (sabab, summa, harakat, shartlar, farazlar, manba URL + sana), ma'lumot cheklovlari. Kalit — Vercel env (egasi uchun; `ALLOWED_EMAILS` bilan cheklanadi) yoki foydalanuvchi o'z kalitini ilovaga kiritadi (faqat brauzerda saqlanadi, bazaga yozilmaydi).
2. **Qo'lda uzatish** — vaqtinchalik muqobil sifatida aniq belgilangan: hisobot (faqat yig'ma raqamlar, xom matn emas) nusxalanadi → o'z ChatGPT/Claude/Gemini suhbatiga joylanadi. Javob ilovaga qaytmaydi.
3. **MB rasmiy kursi** — `cbu.uz` ochiq JSON API, 1 soat kesh, manba va vaqt ko'rsatiladi.
4. Parol, obuna tokeni yoki brauzer cookie'lari hech qayerda ishlatilmaydi.

Modellar env orqali o'zgartiriladi (`OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`). Provayder «model not found» desa — yangi model nomini env'ga yozing (masalan `gpt-5.6`, `gemini-3-flash-preview`).

## 6. Loyiha tuzilishi

```
src/lib/parser.ts     erkin matn → operatsiyalar (sof funksiya, testlangan)
src/lib/compute.ts    balanslar, juftlashtirish, tafovutlar, toifalarni o'rganish
src/lib/stats.ts      davr, toifa, kunlik/oylik seriyalar, qarzlar
src/lib/insights.ts   nazorat xulosalari (qoida asosida, raqam + harakat)
src/lib/store.ts      local-first holat, localStorage, Supabase sinx (outbox, LWW, realtime)
src/lib/report.ts     AI hisobot (yig'ma raqamlar)
src/lib/lineedit.ts   tugmalar bilan satrni qayta yig'ish
src/components/       Composer, History, Stats, Accounts, AiCenter, Auth, charts, ui
src/app/api/ai        AI proxy (OpenAI / Anthropic / Gemini, web search)
src/app/api/rates     Markaziy bank kursi
supabase/schema.sql   jadvallar, RLS, realtime
tests/parser.test.ts  spec misollari + Keep skrinshoti bo'yicha testlar
```

## 7. Qulayliklar

- **Kirish**: email eslab qolinadi (faqat parol so'raladi), parol saqlanmaydi; «Ishonchli qurilma» belgilansa sessiya saqlanadi va parol qayta so'ralmaydi; Sozlamalar ⚙ da **biometrik qulf** (WebAuthn — barmoq/yuz) yoqiladi.
- **Jami tekshiruv**: `Jami = 20640` — barcha hisoblar (shaxs va qayd turidan tashqari) yig'indisi bilan solishtiriladi, pul harakati sifatida yozilmaydi.
- **Ikki valyutali satr**: `J +100$ + 300` ikkita operatsiya (100 $ va 300 ming so'm) sifatida o'qiladi.
- **Ko'p so'zli hisoblar**: `Mirzabek aka=450` — «Mirzabek aka» nomli hisob yaratib bog'lanadi; `Samarqand = 780` kabi safar hisobotlari uchun «Qayd» turi bor (jami pulga qo'shilmaydi).
- **Rejalar va eslatmalar**: muddatli to'lovlar (kvartira — har oy 17-sanagacha, 500 $ + 384 ming; kurs bilan ≈ so'mda ko'rsatiladi) va bir martalik eslatmalar; «Yozish» tugmasi to'lov satrini yozuvga qo'yadi.
- **Tez-tez chiplar**: kamida 3 marta takrorlangan xarajatlar (`K -2 samokat ×20`) bir bosishda yoziladi.
- **Avtomatik AI**: yoqilsa, ilova ochilganda kuniga bir marta fonda tahlil yangilanadi.

### Parolni tiklash (AccessPassword bilan)

«Parolni unutdingizmi?» bosilganda **AccessPassword** (Vercel env'dagi `ACCESS_PASSWORD` qiymati) va yangi parol so'raladi. AccessPassword to'g'ri bo'lsa parol yangilanadi; akkaunt hali yaratilmagan bo'lsa — shu yerning o'zida yaratiladi. Kerakli env: `ACCESS_PASSWORD`, `SUPABASE_SECRET_KEY` (Supabase → API Keys → Secret key), ixtiyoriy `NEXT_PUBLIC_OWNER_EMAIL`. AccessPassword'ni kodga yozmang — GitHub'da ko'rinadi; env'da xavfsiz turadi. Noto'g'ri urinishlar sekinlashtiriladi (5 tadan keyin 1 daqiqa).

### Kunduzgi / tungi rejim

Yuqori paneldagi oy/quyosh tugmasi — tez almashtirish; Sozlamalar ⚙ da «Avto (tizim) / Kunduzgi / Tungi» tanlovi. Tanlov qurilmada eslab qolinadi, «Avto» tizim mavzusiga ergashadi.

## 8. Bepul plan limitlari (egress 5 GB/oy)

Moliya trafikni deyarli sarflamaydi: bitta yozuv ≈ 0,5 KB, sinxronizatsiya faqat o'zgargan qatorlarni (`updated_at > lastSync`) oladi, realtime xabarlari bir necha yuz bayt. Oyiga bir necha MB. Egress limiti boshqa loyihalar hisobidan oshsa, tashkilotdagi barcha loyihalar (shu jumladan Moliya) 402 oladi — shuning uchun og'ir loyihani Supabase **Usage → Egress** bo'limida topib yengillating.

## 9. Ma'lumotlar xavfsizligi

- Supabase RLS: har foydalanuvchi faqat `user_id = auth.uid()` qatorlarini o'qiydi/yozadi.
- Xom matn faqat sizning bazangizda. AI'ga **xom matn yuborilmaydi** — faqat yig'ma raqamlar va toifa nomlari.
- JSON eksport/import — zaxira va qurilmaga ko'chirish uchun (Sozlamalar ⚙).

## 10. Tekshirilgan narsalar

- 54 ta avtomatik test: spec'dagi barcha yozuv shakllari, Keep skrinshotidagi 3 kunlik matn (balanslar `N = 80`, `K = 855`, `Uy = 6200` — sizning raqamlaringizga mos; `N = 1948 noma'lum 2` dagi +2 tafovut topildi; `K -18 = 1069` da 10 ming va `N -12 = 80` da 2 ming arifmetik farq topildi), kech kiritilgan yozuv sanasi, USD/UZS ajratish, juftlashtirish, chala satrlar.
- Brauzer testi (Playwright, mobil 390px va desktop): matn kiritish → tahlil, sahifa yangilangach matn tiklanishi, hisob/amal/summa/toifa tugmalari matnni to'g'ri yig'ishi, chala/noma'lum/noaniq holatlar va tezkor tuzatish, barcha bo'limlar ochilishi.
