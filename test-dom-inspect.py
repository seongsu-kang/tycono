#!/usr/bin/env python3
"""DOM 구조 검사"""

from playwright.sync_api import sync_playwright
import time
import json

def inspect_dom():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        time.sleep(2)

        print("="*60)
        print("1. 하단바 구조 검사")
        print("="*60)

        # 하단바 HTML
        try:
            footer_candidates = [
                'footer',
                '[class*="status-bar"]',
                '[class*="bottom-bar"]',
                '[class*="footer"]'
            ]
            for selector in footer_candidates:
                elements = page.locator(selector).all()
                if elements:
                    print(f"\n✅ Selector: {selector}")
                    html = page.locator(selector).first.inner_html()
                    print(html[:500] if len(html) > 500 else html)
                    break
        except Exception as e:
            print(f"❌ 하단바를 찾을 수 없음: {e}")

        print("\n" + "="*60)
        print("2. PRO 버튼 찾기")
        print("="*60)

        # PRO 버튼 찾기
        pro_selectors = [
            'button:has-text("PRO")',
            'text="PRO"',
            '[data-view="pro"]',
            '.view-mode-pro',
            'button:text-is("PRO")'
        ]

        for selector in pro_selectors:
            try:
                elements = page.locator(selector).all()
                if elements:
                    print(f"\n✅ Selector '{selector}' 발견 ({len(elements)}개)")
                    for i, el in enumerate(elements[:3]):
                        print(f"  [{i}] visible={el.is_visible()}, enabled={el.is_enabled()}")
                        print(f"      outerHTML={el.evaluate('el => el.outerHTML')[:200]}")
            except Exception as e:
                pass

        print("\n" + "="*60)
        print("3. PRO 버튼 클릭 시도")
        print("="*60)

        try:
            # 가장 확실한 selector로 클릭
            pro_btn = page.locator('button:has-text("PRO")').first
            if pro_btn.is_visible():
                print("✅ PRO 버튼 발견, 클릭 시도...")
                pro_btn.click()
                time.sleep(2)

                # Pro View 렌더링 확인
                print("\n4. Pro View 렌더링 확인")
                print("="*60)

                indicators = {
                    'TEAM 섹션': 'text=/TEAM/i',
                    'CHANNELS 섹션': 'text=/CHANNELS/i',
                    'Quick Actions': 'text=/Quick Actions/i',
                    'Dashboard': 'text=/Dashboard|Recent Waves/i',
                    'Pro View 컨테이너': '[class*="pro-view"]',
                }

                for name, selector in indicators.items():
                    try:
                        count = page.locator(selector).count()
                        if count > 0:
                            print(f"✅ {name}: {count}개 발견")
                        else:
                            print(f"❌ {name}: 없음")
                    except:
                        print(f"❌ {name}: 검색 실패")

                # 전체 body 텍스트 샘플
                print("\n5. Body 텍스트 샘플 (처음 500자)")
                print("="*60)
                body_text = page.inner_text('body')
                print(body_text[:500])

                # 스크린샷
                page.screenshot(path='/tmp/dom-inspect-pro-view.png', full_page=True)
                print("\n✅ 스크린샷 저장: /tmp/dom-inspect-pro-view.png")

            else:
                print("❌ PRO 버튼이 보이지 않음")
        except Exception as e:
            print(f"❌ 클릭 실패: {e}")

        browser.close()

if __name__ == "__main__":
    inspect_dom()
