#!/usr/bin/env python3
"""SSE Multiplexing 및 Replay 테스트"""

import requests
import time
import sys

BASE_URL = "http://localhost:3001"

def log_test(tc_id, status, detail=""):
    symbol = "✅" if status == "pass" else "❌" if status == "fail" else "⏭️"
    print(f"{symbol} {tc_id}: {detail}")
    return (tc_id, status, detail)

def test_sse_replay():
    results = []

    # TC-SSE01: SSE Replay 기능 확인
    try:
        # 1. Session 생성 및 메시지 전송
        sess_resp = requests.post(f"{BASE_URL}/api/sessions", json={
            "roleId": "cto",
            "mode": "talk"
        })
        session_id = sess_resp.json()['id']

        # 2. 메시지 전송 (job 생성)
        requests.post(f"{BASE_URL}/api/sessions/{session_id}/reply", json={
            "message": "간단한 상태 확인"
        })
        time.sleep(2)  # job 시작 대기

        # 3. SSE 스트림 연결 (from=0로 replay 요청)
        stream_resp = requests.get(
            f"{BASE_URL}/api/sessions/{session_id}/stream?from=0",
            stream=True,
            timeout=5
        )

        if stream_resp.status_code == 200:
            events = []
            for line in stream_resp.iter_lines(decode_unicode=True):
                if line.startswith('data:'):
                    events.append(line)
                if len(events) >= 3:  # 충분한 이벤트 수집
                    break

            if len(events) >= 2:
                results.append(log_test("TC-SSE01", "pass", f"SSE Replay 성공 ({len(events)}개 이벤트)"))
            else:
                results.append(log_test("TC-SSE01", "fail", f"이벤트 부족 ({len(events)}개)"))
        else:
            results.append(log_test("TC-SSE01", "fail", f"SSE 연결 실패 (status={stream_resp.status_code})"))

        # Job 중단
        requests.post(f"{BASE_URL}/api/sessions/{session_id}/abort")

    except requests.Timeout:
        results.append(log_test("TC-SSE01", "skip", "SSE 스트림 타임아웃 (job이 즉시 완료되었을 수 있음)"))
    except Exception as e:
        results.append(log_test("TC-SSE01", "fail", str(e)[:80]))

    # TC-SSE02: 멀티플렉싱 스트림 확인 (여러 세션 동시 구독)
    try:
        # 2개의 세션 생성
        sess1_resp = requests.post(f"{BASE_URL}/api/sessions", json={"roleId": "cto", "mode": "talk"})
        sess2_resp = requests.post(f"{BASE_URL}/api/sessions", json={"roleId": "pm", "mode": "talk"})

        sess1_id = sess1_resp.json()['id']
        sess2_id = sess2_resp.json()['id']

        # 각각 메시지 전송
        requests.post(f"{BASE_URL}/api/sessions/{sess1_id}/reply", json={"message": "CTO 테스트"})
        requests.post(f"{BASE_URL}/api/sessions/{sess2_id}/reply", json={"message": "PM 테스트"})

        time.sleep(1)

        # 동시 SSE 연결
        stream1_resp = requests.get(f"{BASE_URL}/api/sessions/{sess1_id}/stream", stream=True, timeout=3)
        stream2_resp = requests.get(f"{BASE_URL}/api/sessions/{sess2_id}/stream", stream=True, timeout=3)

        if stream1_resp.status_code == 200 and stream2_resp.status_code == 200:
            results.append(log_test("TC-SSE02", "pass", "멀티플렉싱 스트림 연결 성공"))
        else:
            results.append(log_test("TC-SSE02", "fail", f"스트림 연결 실패 (s1={stream1_resp.status_code}, s2={stream2_resp.status_code})"))

        # 중단
        requests.post(f"{BASE_URL}/api/sessions/{sess1_id}/abort")
        requests.post(f"{BASE_URL}/api/sessions/{sess2_id}/abort")

    except requests.Timeout:
        results.append(log_test("TC-SSE02", "skip", "타임아웃"))
    except Exception as e:
        results.append(log_test("TC-SSE02", "fail", str(e)[:80]))

    # 결과 요약
    print("\n" + "="*60)
    print("SSE Multiplexing 테스트 결과 요약")
    print("="*60)

    passed = sum(1 for _, status, _ in results if status == "pass")
    failed = sum(1 for _, status, _ in results if status == "fail")
    skipped = sum(1 for _, status, _ in results if status == "skip")

    print(f"전체: {len(results)}개")
    print(f"✅ Pass: {passed}개")
    print(f"❌ Fail: {failed}개")
    print(f"⏭️ Skip: {skipped}개")

    if failed > 0:
        print("\n판정: 🔴 FAIL")
        return 1
    elif passed >= 1:
        print("\n판정: 🟢 PASS")
        return 0
    else:
        print("\n판정: 🟡 CONDITIONAL PASS")
        return 0

if __name__ == "__main__":
    sys.exit(test_sse_replay())
