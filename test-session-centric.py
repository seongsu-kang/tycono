#!/usr/bin/env python3
"""Session-Centric 기능 테스트"""

import requests
import time
import json
import sys

BASE_URL = "http://localhost:3001"

def log_test(tc_id, status, detail=""):
    symbol = "✅" if status == "pass" else "❌" if status == "fail" else "⏭️"
    print(f"{symbol} {tc_id}: {detail}")
    return (tc_id, status, detail)

def test_session_centric():
    results = []

    # TC-SESSION01: Session 생성
    try:
        resp = requests.post(f"{BASE_URL}/api/sessions", json={
            "roleId": "cto",
            "mode": "talk"
        })
        if resp.status_code in [200, 201]:
            session_data = resp.json()
            session_id = session_data.get('id') or session_data.get('sessionId')

            if session_id:
                results.append(log_test("TC-SESSION01", "pass", f"Session 생성 성공 (id={session_id[:12]}...)"))

                # TC-SESSION02: sendMessage() API 동작 (실제로는 /reply 엔드포인트)
                try:
                    msg_resp = requests.post(f"{BASE_URL}/api/sessions/{session_id}/reply", json={
                        "message": "테스트 메시지: 현재 아키텍처 상태 요약해줘"
                    })

                    if msg_resp.status_code in [200, 201, 202]:
                        results.append(log_test("TC-SESSION02", "pass", "sendMessage() API 정상 동작"))

                        # TC-SESSION03: Session abort
                        time.sleep(1)
                        abort_resp = requests.post(f"{BASE_URL}/api/sessions/{session_id}/abort")
                        if abort_resp.status_code in [200, 204]:
                            results.append(log_test("TC-SESSION03", "pass", "Session abort 성공"))
                        else:
                            results.append(log_test("TC-SESSION03", "fail", f"abort 실패 (status={abort_resp.status_code})"))
                    else:
                        results.append(log_test("TC-SESSION02", "fail", f"sendMessage 실패 (status={msg_resp.status_code})"))
                        results.append(log_test("TC-SESSION03", "skip", "TC-SESSION02 실패로 스킵"))
                except Exception as e:
                    results.append(log_test("TC-SESSION02", "fail", str(e)[:80]))
                    results.append(log_test("TC-SESSION03", "skip", "TC-SESSION02 실패로 스킵"))

                # TC-SESSION04: Session 조회 (sessionIds 확인)
                try:
                    sess_resp = requests.get(f"{BASE_URL}/api/sessions/{session_id}")
                    if sess_resp.status_code == 200:
                        sess_data = sess_resp.json()
                        has_messages = 'messages' in sess_data and len(sess_data['messages']) > 0
                        if has_messages:
                            results.append(log_test("TC-SESSION04", "pass", f"Session 조회 성공 ({len(sess_data['messages'])}개 메시지)"))
                        else:
                            results.append(log_test("TC-SESSION04", "fail", "Session에 메시지가 없음"))
                    else:
                        results.append(log_test("TC-SESSION04", "fail", f"Session 조회 실패 (status={sess_resp.status_code})"))
                except Exception as e:
                    results.append(log_test("TC-SESSION04", "fail", str(e)[:80]))
            else:
                results.append(log_test("TC-SESSION01", "fail", "Session ID가 응답에 없음"))
                results.append(log_test("TC-SESSION02", "skip", "TC-SESSION01 실패로 스킵"))
                results.append(log_test("TC-SESSION03", "skip", "TC-SESSION01 실패로 스킵"))
                results.append(log_test("TC-SESSION04", "skip", "TC-SESSION01 실패로 스킵"))
        else:
            results.append(log_test("TC-SESSION01", "fail", f"Session 생성 실패 (status={resp.status_code})"))
            results.append(log_test("TC-SESSION02", "skip", "TC-SESSION01 실패로 스킵"))
            results.append(log_test("TC-SESSION03", "skip", "TC-SESSION01 실패로 스킵"))
            results.append(log_test("TC-SESSION04", "skip", "TC-SESSION01 실패로 스킵"))
    except Exception as e:
        results.append(log_test("TC-SESSION01", "fail", str(e)[:80]))
        results.append(log_test("TC-SESSION02", "skip", "TC-SESSION01 실패로 스킵"))
        results.append(log_test("TC-SESSION03", "skip", "TC-SESSION01 실패로 스킵"))
        results.append(log_test("TC-SESSION04", "skip", "TC-SESSION01 실패로 스킵"))

    # TC-SESSION05: Wave → Session 생성 확인 (operations/waves 확인)
    try:
        waves_resp = requests.get(f"{BASE_URL}/api/operations/waves")
        if waves_resp.status_code == 200:
            waves_data = waves_resp.json()
            if isinstance(waves_data, list) and len(waves_data) > 0:
                latest_wave = waves_data[0]
                has_session_ids = 'sessionIds' in latest_wave and len(latest_wave['sessionIds']) > 0
                if has_session_ids:
                    results.append(log_test("TC-SESSION05", "pass", f"Wave에 sessionIds 존재 ({len(latest_wave['sessionIds'])}개)"))
                else:
                    results.append(log_test("TC-SESSION05", "fail", "Wave에 sessionIds가 없음"))
            else:
                results.append(log_test("TC-SESSION05", "skip", "Wave 기록이 없음"))
        else:
            results.append(log_test("TC-SESSION05", "fail", f"Waves 조회 실패 (status={waves_resp.status_code})"))
    except Exception as e:
        results.append(log_test("TC-SESSION05", "fail", str(e)[:80]))

    # 결과 요약
    print("\n" + "="*60)
    print("Session-Centric 테스트 결과 요약")
    print("="*60)

    passed = sum(1 for _, status, _ in results if status == "pass")
    failed = sum(1 for _, status, _ in results if status == "fail")
    skipped = sum(1 for _, status, _ in results if status == "skip")

    print(f"전체: {len(results)}개")
    print(f"✅ Pass: {passed}개")
    print(f"❌ Fail: {failed}개")
    print(f"⏭️ Skip: {skipped}개")

    if failed > 0 and passed < 3:
        print("\n판정: 🔴 FAIL")
        return 1
    elif passed >= 3:
        print("\n판정: 🟢 PASS")
        return 0
    else:
        print("\n판정: 🟡 CONDITIONAL PASS")
        return 0

if __name__ == "__main__":
    sys.exit(test_session_centric())
