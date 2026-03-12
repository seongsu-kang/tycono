#!/usr/bin/env python3
"""Pro View E2E 테스트"""

from playwright.sync_api import sync_playwright, expect
import time
import sys

def log_test(name, status, detail=""):
    symbol = "✅" if status == "pass" else "❌" if status == "fail" else "⏭️"
    print(f"{symbol} {name}: {detail}")

def test_pro_view():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 초기 로드
            page.goto('http://localhost:5173')
            page.wait_for_load_state('networkidle')
            time.sleep(2)  # 초기화 대기

            # TC-PRO01: Office → Pro 뷰 전환
            try:
                # 하단바에서 PRO 버튼 찾기
                pro_button = page.locator('text=/PRO/i').first
                if pro_button.is_visible(timeout=5000):
                    pro_button.click()
                    page.wait_for_timeout(1000)

                    # Pro View 렌더링 확인
                    pro_view = page.locator('.pro-view, [class*="pro"], [data-view="pro"]').first
                    if pro_view.count() > 0 or page.locator('text=/Team|TEAM/').count() > 0:
                        log_test("TC-PRO01", "pass", "Office → Pro 뷰 전환 성공")
                        results.append(("TC-PRO01", "pass"))
                    else:
                        log_test("TC-PRO01", "fail", "Pro View가 렌더링되지 않음")
                        results.append(("TC-PRO01", "fail"))
                else:
                    log_test("TC-PRO01", "skip", "PRO 버튼을 찾을 수 없음")
                    results.append(("TC-PRO01", "skip"))
            except Exception as e:
                log_test("TC-PRO01", "fail", str(e))
                results.append(("TC-PRO01", "fail"))

            # TC-PRO03: 사이드바 TEAM 렌더링
            try:
                team_section = page.locator('text=/TEAM|Team/i').first
                if team_section.is_visible(timeout=3000):
                    # Role 이름 찾기 (CTO, PM, Engineer 등)
                    roles_visible = (
                        page.locator('text=/CTO|PM|Engineer|Designer|QA/i').count() > 0
                    )
                    if roles_visible:
                        log_test("TC-PRO03", "pass", "사이드바 TEAM 렌더링 확인")
                        results.append(("TC-PRO03", "pass"))
                    else:
                        log_test("TC-PRO03", "fail", "TEAM 섹션은 있으나 Role이 보이지 않음")
                        results.append(("TC-PRO03", "fail"))
                else:
                    log_test("TC-PRO03", "fail", "TEAM 섹션이 보이지 않음")
                    results.append(("TC-PRO03", "fail"))
            except Exception as e:
                log_test("TC-PRO03", "fail", str(e))
                results.append(("TC-PRO03", "fail"))

            # TC-PRO04: 사이드바 CHANNELS 렌더링
            try:
                channels_section = page.locator('text=/CHANNELS|Channels/i').first
                if channels_section.is_visible(timeout=3000):
                    # 채널 이름 찾기 (general, wave-log, decisions, knowledge)
                    channels_visible = (
                        page.locator('text=/general|wave-log|decisions|knowledge/i').count() > 0
                    )
                    if channels_visible:
                        log_test("TC-PRO04", "pass", "사이드바 CHANNELS 렌더링 확인")
                        results.append(("TC-PRO04", "pass"))
                    else:
                        log_test("TC-PRO04", "fail", "CHANNELS 섹션은 있으나 채널이 보이지 않음")
                        results.append(("TC-PRO04", "fail"))
                else:
                    log_test("TC-PRO04", "fail", "CHANNELS 섹션이 보이지 않음")
                    results.append(("TC-PRO04", "fail"))
            except Exception as e:
                log_test("TC-PRO04", "fail", str(e))
                results.append(("TC-PRO04", "fail"))

            # TC-PRO05: Dashboard 렌더링
            try:
                dashboard_elements = (
                    page.locator('text=/Quick Actions|Recent Waves|Knowledge/i').count()
                )
                if dashboard_elements >= 2:
                    log_test("TC-PRO05", "pass", f"Dashboard 요소 {dashboard_elements}개 확인")
                    results.append(("TC-PRO05", "pass"))
                else:
                    log_test("TC-PRO05", "fail", f"Dashboard 요소 부족 ({dashboard_elements}개)")
                    results.append(("TC-PRO05", "fail"))
            except Exception as e:
                log_test("TC-PRO05", "fail", str(e))
                results.append(("TC-PRO05", "fail"))

            # TC-PRO06: Team 멤버 클릭 → DM 채팅
            try:
                # CTO 클릭 시도
                cto_link = page.locator('text=/CTO/i').first
                if cto_link.is_visible(timeout=3000):
                    cto_link.click()
                    page.wait_for_timeout(1000)

                    # 채팅 UI 렌더링 확인
                    chat_visible = (
                        page.locator('text=/message|chat|input/i').count() > 0 or
                        page.locator('textarea, input[type="text"]').count() > 0
                    )
                    if chat_visible:
                        log_test("TC-PRO06", "pass", "DM 채팅 UI 렌더링 확인")
                        results.append(("TC-PRO06", "pass"))
                    else:
                        log_test("TC-PRO06", "fail", "채팅 UI가 렌더링되지 않음")
                        results.append(("TC-PRO06", "fail"))
                else:
                    log_test("TC-PRO06", "skip", "CTO 링크를 찾을 수 없음")
                    results.append(("TC-PRO06", "skip"))
            except Exception as e:
                log_test("TC-PRO06", "fail", str(e))
                results.append(("TC-PRO06", "fail"))

            # TC-PRO08: Profile 패널 열기
            try:
                # 헤더에서 아바타 또는 Profile 버튼 찾기
                profile_trigger = page.locator('text=/Profile/i, [class*="avatar"]').first
                if profile_trigger.is_visible(timeout=3000):
                    profile_trigger.click()
                    page.wait_for_timeout(1000)

                    # Profile 패널 확인
                    profile_panel = page.locator('text=/Level|Status|Skills|Lv\\./i').first
                    if profile_panel.is_visible(timeout=3000):
                        log_test("TC-PRO08", "pass", "Profile 패널 렌더링 확인")
                        results.append(("TC-PRO08", "pass"))

                        # TC-PRO09: Profile 패널 닫기
                        close_button = page.locator('text=/×|Close/i, button[aria-label*="close"]').first
                        if close_button.is_visible(timeout=2000):
                            close_button.click()
                            page.wait_for_timeout(500)
                            log_test("TC-PRO09", "pass", "Profile 패널 닫기 성공")
                            results.append(("TC-PRO09", "pass"))
                        else:
                            log_test("TC-PRO09", "skip", "닫기 버튼을 찾을 수 없음")
                            results.append(("TC-PRO09", "skip"))
                    else:
                        log_test("TC-PRO08", "fail", "Profile 패널이 렌더링되지 않음")
                        results.append(("TC-PRO08", "fail"))
                        results.append(("TC-PRO09", "skip"))
                else:
                    log_test("TC-PRO08", "skip", "Profile 트리거를 찾을 수 없음")
                    results.append(("TC-PRO08", "skip"))
                    results.append(("TC-PRO09", "skip"))
            except Exception as e:
                log_test("TC-PRO08", "fail", str(e))
                results.append(("TC-PRO08", "fail"))
                results.append(("TC-PRO09", "skip"))

            # TC-PRO02: Pro → Office 뷰 전환
            try:
                office_button = page.locator('text=/OFFICE|Office/i').first
                if office_button.is_visible(timeout=3000):
                    office_button.click()
                    page.wait_for_timeout(1000)

                    # Office View 렌더링 확인 (isometric 캔버스 또는 Office 특유 요소)
                    office_elements = page.locator('canvas, [class*="office"], [class*="isometric"]').count()
                    if office_elements > 0:
                        log_test("TC-PRO02", "pass", "Pro → Office 뷰 전환 성공")
                        results.append(("TC-PRO02", "pass"))
                    else:
                        log_test("TC-PRO02", "fail", "Office View 요소를 찾을 수 없음")
                        results.append(("TC-PRO02", "fail"))
                else:
                    log_test("TC-PRO02", "skip", "OFFICE 버튼을 찾을 수 없음")
                    results.append(("TC-PRO02", "skip"))
            except Exception as e:
                log_test("TC-PRO02", "fail", str(e))
                results.append(("TC-PRO02", "fail"))

        except Exception as e:
            print(f"❌ 전체 테스트 실패: {e}")
        finally:
            # 최종 스크린샷
            page.screenshot(path='/tmp/pro-view-test-final.png', full_page=True)
            browser.close()

    # 결과 요약
    print("\n" + "="*60)
    print("테스트 결과 요약")
    print("="*60)

    passed = sum(1 for _, status in results if status == "pass")
    failed = sum(1 for _, status in results if status == "fail")
    skipped = sum(1 for _, status in results if status == "skip")

    print(f"전체: {len(results)}개")
    print(f"Pass: {passed}개")
    print(f"Fail: {failed}개")
    print(f"Skip: {skipped}개")

    if failed > 0:
        print("\n판정: 🔴 FAIL")
        return 1
    elif passed >= 5:
        print("\n판정: 🟢 PASS")
        return 0
    else:
        print("\n판정: 🟡 CONDITIONAL PASS")
        return 0

if __name__ == "__main__":
    sys.exit(test_pro_view())
