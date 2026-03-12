#!/usr/bin/env python3
"""Pro View 시각적 검증 테스트 (headless=False)"""

from playwright.sync_api import sync_playwright
import time

def visual_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # 초기 로드
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')
        time.sleep(2)

        print("✅ 초기 로드 완료. Office View 렌더링 확인 중...")
        page.screenshot(path='/tmp/step-1-office-view.png', full_page=True)

        # PRO 버튼 찾기
        print("\n🔍 PRO 버튼 찾기...")
        page.screenshot(path='/tmp/step-2-before-click-pro.png', full_page=True)

        # 모든 텍스트 요소 출력
        all_text = page.inner_text('body')
        if 'PRO' in all_text or 'Pro' in all_text:
            print(f"✅ 페이지에 'PRO' 텍스트 발견")
        else:
            print(f"❌ 페이지에 'PRO' 텍스트 없음")

        # PRO 버튼 클릭 시도 (다양한 selector)
        selectors = [
            'button:has-text("PRO")',
            'text="PRO"',
            '[data-view="pro"]',
            '.view-toggle >> text=/PRO/i'
        ]

        clicked = False
        for selector in selectors:
            try:
                element = page.locator(selector).first
                if element.is_visible(timeout=2000):
                    print(f"✅ Selector '{selector}' 발견, 클릭 시도...")
                    element.click()
                    clicked = True
                    break
            except Exception as e:
                print(f"⏭️ Selector '{selector}' 실패: {type(e).__name__}")

        if not clicked:
            print("❌ PRO 버튼을 찾을 수 없음")
            # DOM 구조 확인
            print("\n📋 하단바 HTML 구조:")
            try:
                footer = page.locator('footer, [class*="bottom"], [class*="status"]').first
                if footer.count() > 0:
                    print(footer.inner_html())
            except:
                pass

        time.sleep(2)
        page.screenshot(path='/tmp/step-3-after-click-pro.png', full_page=True)

        # Pro View 요소 확인
        print("\n🔍 Pro View 렌더링 확인...")
        pro_indicators = [
            'text=/TEAM/i',
            'text=/CHANNELS/i',
            'text=/Quick Actions/i',
            '[class*="pro-"]',
            '[data-view="pro"]'
        ]

        for indicator in pro_indicators:
            try:
                if page.locator(indicator).count() > 0:
                    print(f"✅ '{indicator}' 발견")
            except:
                pass

        # 10초 대기 (수동 확인용)
        print("\n⏳ 10초 대기 중 (수동 확인 가능)...")
        time.sleep(10)

        browser.close()

if __name__ == "__main__":
    visual_test()
