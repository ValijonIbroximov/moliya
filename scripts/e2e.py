import asyncio, json, sys
from playwright.async_api import async_playwright

KEEP = """20.08
Uy +2400 = 4400
N = 432
K = 1085
K -2 = 1083 samokat
K -2 = 1081 samokat
K -4 = 1077 metro
N -4 = 428 suv
N -10 = 418 laminatsiya
N -38 = 380 do'kon
N -60 = 320 rachot Javohir+ kechki ovqatga
K -18 = 1069 virent samokat
K -10 = 1059 ? Kamomat

21.08
K -2 = 1057 Samokat
K -202 = 855 Mirzohid akaga
N +200 = 520 Mirzohid akadan
N +1012 = 1532 premya
N +450 = 1982 Mirzabek aka rachot
N +30 = 2012 Oybek Aka Xorazmdagisi
N -126 = 1886 kechki ovqat
N +60 = 1946 Javohir rachot

22.08
N = 1948 noma'lum 2
N -1800 = 148 uyga
Uy +1800 = 6200 naqddan
N -28 = 120 obed
N -30 = 90 apteka
N -12 = 80 suvga 2 ming tangadan"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="Asia/Tashkent")
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:3000/", wait_until="networkidle")
        await page.wait_for_selector("textarea.raw")
        await page.screenshot(path="shots/01-empty-mobile.png", full_page=True)

        # 1. Keep matnini kiritish
        ta = page.locator("textarea.raw")
        await ta.click()
        await ta.fill(KEEP)
        await page.wait_for_timeout(300)
        # sana sarlavhasi 20.08 bo'lgani uchun yozuv sanasini ham 20-avgustga o'rnatish shart emas — sarlavha ustun
        body = await page.inner_text("body")
        assert "tafovut" in body.lower(), "tafovut ko'rinmadi"
        await page.screenshot(path="shots/02-keep-mobile.png", full_page=True)
        state = await page.evaluate("JSON.parse(localStorage.getItem('moliya:v1:guest')).notes.length")
        print("notes in localStorage:", state)

        # 2. Reload — chala/to'liq matn tiklanadi
        await page.reload(wait_until="networkidle")
        await page.wait_for_selector("textarea.raw")
        val = await page.locator("textarea.raw").input_value()
        assert val == KEEP, "reload dan keyin matn yo'qoldi"
        print("reload OK, len", len(val))

        # 3. Yangi yozuv + tugmalar bilan yozish
        await page.get_by_role("button", name="+ Yangi yozuv").click()
        await page.wait_for_timeout(200)
        await page.locator(".tiles button.tile", has_text="K").first.click()
        await page.wait_for_timeout(100)
        v = await page.locator("textarea.raw").input_value()
        print("after tile:", repr(v))
        await page.locator("#amt").fill("30")
        await page.wait_for_timeout(100)
        v = await page.locator("textarea.raw").input_value()
        print("after amount:", repr(v))
        await page.locator("#cat").fill("taksi")
        await page.wait_for_timeout(100)
        v = await page.locator("textarea.raw").input_value()
        print("after category:", repr(v))
        assert v.strip() == "K -30 taksi", v
        # op → kirim
        await page.locator(".segment button", has_text="Kirim").click()
        v = await page.locator("textarea.raw").input_value()
        print("after op +:", repr(v))
        assert v.strip() == "K +30 taksi", v
        # o'tkazma
        await page.locator(".segment button", has_text="O'tkazma").click()
        v = await page.locator("textarea.raw").input_value()
        print("after op ->:", repr(v))
        assert v.strip().startswith("K -> "), v
        # qoldiq
        await page.locator(".segment button", has_text="Qoldiq").click()
        v = await page.locator("textarea.raw").input_value()
        print("after op =:", repr(v))
        assert v.strip() == "K = 30 taksi", v
        await page.screenshot(path="shots/03-compose-mobile.png", full_page=True)

        # 4. chala yozuv
        await page.locator("textarea.raw").fill("N -")
        await page.wait_for_timeout(200)
        body = await page.inner_text("body")
        assert "Summa yetishmaydi" in body, "chala sabab ko'rinmadi"
        await page.locator("textarea.raw").fill("X -20 nimadir")
        await page.wait_for_timeout(200)
        body = await page.inner_text("body")
        assert "Noma'lum qisqartma" in body
        await page.locator("textarea.raw").fill("N -1500000")
        await page.wait_for_timeout(200)
        body = await page.inner_text("body")
        assert "Birlik noaniq" in body
        await page.get_by_role("button", name="Bu so'mda").click()
        v = await page.locator("textarea.raw").input_value()
        print("after fix:", repr(v))
        assert "so'm" in v

        # 5. Tablar
        for name, path in [("Tarix", "04-history"), ("Tahlil", "05-stats"), ("Hisoblar", "06-accounts"), ("AI", "07-ai")]:
            await page.locator("nav.nav button", has_text=name).click()
            await page.wait_for_timeout(400)
            await page.screenshot(path=f"shots/{path}-mobile.png", full_page=True)
        body = await page.inner_text("body")
        assert "Akkaunt/obuna orqali: yo'q" in body

        # 6. Desktop
        await ctx.close()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900}, timezone_id="Asia/Tashkent", storage_state=None)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:3000/", wait_until="networkidle")
        await page.wait_for_selector("textarea.raw")
        await page.locator("textarea.raw").fill(KEEP)
        await page.wait_for_timeout(300)
        await page.screenshot(path="shots/08-desktop-editor.png", full_page=True)
        await page.locator("nav.nav button", has_text="Tahlil").click()
        await page.wait_for_timeout(400)
        await page.screenshot(path="shots/09-desktop-stats.png", full_page=True)
        print("console errors:", errors)
        await browser.close()

asyncio.run(main())
