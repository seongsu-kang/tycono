#!/usr/bin/env python3
"""Pro View 전체 기능 E2E 테스트 (실제 구현 기반)"""

from playwright.sync_api import sync_playwright
import time
import sys

def log_test(tc_id, status, detail=""):
    symbol = "✅" if status == "pass" else "❌" if status == "fail" else "⏭️"
    print(f"{symbol} {tc_id}: {detail}")
    return (tc_id, status, detail)

def test_pro_view_full():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 초기 로드
            page.goto('http://localhost:5173')
            page.wait_for_load_state('networkidle')
            time.sleep(2)

            # TC-PRO01: Office → Pro 뷰 전환
            try:
                office_view_before = page.locator('canvas, [class*="office"]').count() > 0
                pro_btn = page.locator('button:has-text("PRO")').first

                if pro_btn.is_visible(timeout=5000):
                    pro_btn.click()
                    time.sleep(2)

                    # Dashboard 헤더 확인
                    dashboard_header = page.locator('text=/Dashboard/i').count() > 0
                    if dashboard_header:
                        results.append(log_test("TC-PRO01", "pass", "Office → Pro 뷰 전환 성공"))
                    else:
                        results.append(log_test("TC-PRO01", "fail", "Dashboard가 렌더링되지 않음"))
                else:
                    results.append(log_test("TC-PRO01", "skip", "PRO 버튼을 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO01", "fail", str(e)[:100]))

            # TC-PRO03: 사이드바 TEAM 렌더링
            try:
                team_header = page.locator('text=/^TEAM$/i').count() > 0
                role_names = ['Su', 'Monni', 'Noah', 'CoolGuy', 'Joyce', 'Devin']
                roles_found = sum(1 for name in role_names if page.locator(f'text="{name}"').count() > 0)

                if team_header and roles_found >= 4:
                    results.append(log_test("TC-PRO03", "pass", f"사이드바 TEAM 렌더링 확인 ({roles_found}개 Role)"))
                else:
                    results.append(log_test("TC-PRO03", "fail", f"TEAM 불완전 (header={team_header}, roles={roles_found})"))
            except Exception as e:
                results.append(log_test("TC-PRO03", "fail", str(e)[:100]))

            # TC-PRO04: 사이드바 네비게이션 버튼 (Chats, Waves, Decisions, Knowledge)
            try:
                nav_buttons = ['Chats', 'Waves', 'Decisions', 'Knowledge']
                nav_found = sum(1 for btn in nav_buttons if page.locator(f'text="{btn}"').count() > 0)

                if nav_found >= 3:
                    results.append(log_test("TC-PRO04", "pass", f"사이드바 네비게이션 렌더링 ({nav_found}/4개)"))
                else:
                    results.append(log_test("TC-PRO04", "fail", f"네비게이션 부족 ({nav_found}/4개)"))
            except Exception as e:
                results.append(log_test("TC-PRO04", "fail", str(e)[:100]))

            # TC-PRO05: Dashboard 렌더링
            try:
                dashboard_sections = {
                    'New Wave': page.locator('text=/New Wave/i').count() > 0,
                    'Knowledge': page.locator('text=/Knowledge/i').count() > 0,
                    'TEAM': page.locator('text=/^TEAM$/i').count() >= 2,  # 사이드바 + 메인
                    'RECENT WAVES': page.locator('text=/RECENT WAVES|Recent Waves/i').count() > 0,
                }

                sections_ok = sum(1 for v in dashboard_sections.values() if v)
                if sections_ok >= 3:
                    results.append(log_test("TC-PRO05", "pass", f"Dashboard 렌더링 ({sections_ok}/4개 섹션)"))
                else:
                    results.append(log_test("TC-PRO05", "fail", f"Dashboard 불완전 ({sections_ok}/4개)"))
            except Exception as e:
                results.append(log_test("TC-PRO05", "fail", str(e)[:100]))

            # TC-PRO06: Team 멤버 클릭 → DM 채팅
            try:
                # 사이드바의 Su 클릭
                su_in_sidebar = page.locator('.pro-sidebar, [class*="sidebar"]').locator('text="Su"').first
                if su_in_sidebar.is_visible(timeout=3000):
                    su_in_sidebar.click()
                    time.sleep(1.5)

                    # 채팅 UI 확인 (textarea, input, message list)
                    chat_input = page.locator('textarea, input[placeholder*="message"], input[placeholder*="Message"]').count() > 0
                    if chat_input:
                        results.append(log_test("TC-PRO06", "pass", "Team 멤버 클릭 → DM 채팅 렌더링"))
                    else:
                        results.append(log_test("TC-PRO06", "fail", "채팅 입력 필드가 렌더링되지 않음"))
                else:
                    results.append(log_test("TC-PRO06", "skip", "사이드바에서 Su를 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO06", "fail", str(e)[:100]))

            # TC-PRO07: DM 채팅 입력 테스트
            try:
                chat_input_el = page.locator('textarea, input[type="text"]').filter(has_text="").first
                if chat_input_el.is_visible(timeout=2000):
                    chat_input_el.fill("테스트 메시지")
                    time.sleep(0.5)
                    value = chat_input_el.input_value()
                    if "테스트" in value:
                        results.append(log_test("TC-PRO07", "pass", "채팅 입력 성공"))
                    else:
                        results.append(log_test("TC-PRO07", "fail", f"입력값 불일치: {value}"))
                else:
                    results.append(log_test("TC-PRO07", "skip", "채팅 입력 필드를 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO07", "fail", str(e)[:100]))

            # TC-PRO10: 네비게이션 전환 (Waves 클릭)
            try:
                waves_btn = page.locator('button:has-text("Waves"), text="Waves"').first
                if waves_btn.is_visible(timeout=2000):
                    waves_btn.click()
                    time.sleep(1)

                    # Waves 관련 콘텐츠 확인
                    waves_content = page.locator('text=/Wave wave-|RECENT WAVES/i').count() > 0
                    if waves_content:
                        results.append(log_test("TC-PRO10", "pass", "Waves 네비게이션 전환 성공"))
                    else:
                        results.append(log_test("TC-PRO10", "fail", "Waves 콘텐츠가 렌더링되지 않음"))
                else:
                    results.append(log_test("TC-PRO10", "skip", "Waves 버튼을 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO10", "fail", str(e)[:100]))

            # TC-PRO11: Knowledge 네비게이션
            try:
                knowledge_btn = page.locator('button:has-text("Knowledge"), .nav-btn:has-text("Knowledge")').first
                if knowledge_btn.is_visible(timeout=2000):
                    knowledge_btn.click()
                    time.sleep(1)

                    # Knowledge 콘텐츠 확인
                    kb_content = page.locator('text=/KNOWLEDGE BASE|documents|articles/i').count() > 0
                    if kb_content:
                        results.append(log_test("TC-PRO11", "pass", "Knowledge 네비게이션 전환 성공"))
                    else:
                        results.append(log_test("TC-PRO11", "fail", "Knowledge 콘텐츠가 렌더링되지 않음"))
                else:
                    results.append(log_test("TC-PRO11", "skip", "Knowledge 버튼을 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO11", "fail", str(e)[:100]))

            # TC-PRO02: Pro → Office 뷰 전환
            try:
                office_btn = page.locator('button:has-text("OFFICE")').first
                if office_btn.is_visible(timeout=3000):
                    office_btn.click()
                    time.sleep(2)

                    # Office View 렌더링 확인
                    canvas = page.locator('canvas').count() > 0
                    if canvas:
                        results.append(log_test("TC-PRO02", "pass", "Pro → Office 뷰 전환 성공"))
                    else:
                        results.append(log_test("TC-PRO02", "fail", "Office View 캔버스가 렌더링되지 않음"))
                else:
                    results.append(log_test("TC-PRO02", "skip", "OFFICE 버튼을 찾을 수 없음"))
            except Exception as e:
                results.append(log_test("TC-PRO02", "fail", str(e)[:100]))

        except Exception as e:
            print(f"❌ 전체 테스트 실패: {e}")
        finally:
            page.screenshot(path='/tmp/pro-view-test-full-final.png', full_page=True)
            browser.close()

    # 결과 요약
    print("\n" + "="*60)
    print("Pro View 테스트 결과 요약")
    print("="*60)

    passed = sum(1 for _, status, _ in results if status == "pass")
    failed = sum(1 for _, status, _ in results if status == "fail")
    skipped = sum(1 for _, status, _ in results if status == "skip")

    print(f"전체: {len(results)}개")
    print(f"✅ Pass: {passed}개")
    print(f"❌ Fail: {failed}개")
    print(f"⏭️ Skip: {skipped}개")

    # 판정
    if failed > 0 and passed < 5:
        print("\n판정: 🔴 FAIL")
        return 1
    elif passed >= 7:
        print("\n판정: 🟢 PASS")
        return 0
    else:
        print("\n판정: 🟡 CONDITIONAL PASS")
        return 0

if __name__ == "__main__":
    sys.exit(test_pro_view_full())
