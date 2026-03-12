#!/usr/bin/env python3
"""
SSE 스트림 데이터 검증 스크립트
Data Analyst가 SSE 멀티플렉싱 및 히스토리 replay 검증
"""

import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from typing import List, Dict, Any

import requests


def parse_sse_stream(url: str, max_events: int = 100, timeout_sec: int = 30) -> List[Dict[str, Any]]:
    """SSE 스트림 연결하여 이벤트 수집"""
    print(f"🔌 SSE 연결: {url}")
    events = []

    try:
        with requests.get(url, stream=True, timeout=timeout_sec) as response:
            response.raise_for_status()

            event_type = None
            data_lines = []
            start_time = time.time()

            for line in response.iter_lines(decode_unicode=True):
                # Timeout 체크
                if time.time() - start_time > timeout_sec:
                    print(f"⏱️  타임아웃 ({timeout_sec}s) — 수집 종료")
                    break

                if not line:
                    # 빈 줄 = 이벤트 종료
                    if event_type and data_lines:
                        try:
                            data = json.loads(''.join(data_lines))
                            events.append({
                                'event_type': event_type,
                                'data': data,
                                'received_at': time.time()
                            })
                        except json.JSONDecodeError as e:
                            print(f"⚠️  JSON 파싱 실패: {e}")

                    event_type = None
                    data_lines = []

                    if len(events) >= max_events:
                        print(f"✅ 목표 이벤트 수 도달 ({max_events})")
                        break
                    continue

                if line.startswith('event:'):
                    event_type = line[6:].strip()
                elif line.startswith('data:'):
                    data_lines.append(line[5:].strip())
                elif line.startswith(':'):
                    # Heartbeat or comment
                    pass

    except requests.RequestException as e:
        print(f"❌ 연결 오류: {e}")
        return events

    print(f"📦 총 {len(events)}개 이벤트 수집 완료")
    return events


def validate_wave_seq_continuity(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """waveSeq 연속성 검증"""
    print("\n=== waveSeq 연속성 검증 ===")

    wave_events = [e for e in events if e['event_type'] == 'wave:event']

    if not wave_events:
        return {'status': 'SKIP', 'reason': 'wave:event 없음'}

    wave_seqs = [e['data']['waveSeq'] for e in wave_events]
    wave_seqs_sorted = sorted(wave_seqs)

    # 연속성 체크
    expected = list(range(wave_seqs_sorted[0], wave_seqs_sorted[-1] + 1))
    missing = set(expected) - set(wave_seqs)
    duplicates = [seq for seq in wave_seqs if wave_seqs.count(seq) > 1]

    result = {
        'status': 'PASS' if not missing and not duplicates else 'FAIL',
        'total_events': len(wave_events),
        'wave_seq_range': f"{wave_seqs_sorted[0]} ~ {wave_seqs_sorted[-1]}",
        'missing_seqs': list(missing),
        'duplicate_seqs': list(set(duplicates)),
        'is_sorted': wave_seqs == wave_seqs_sorted
    }

    print(f"  총 이벤트: {result['total_events']}")
    print(f"  waveSeq 범위: {result['wave_seq_range']}")
    print(f"  누락: {result['missing_seqs'] or 'None'}")
    print(f"  중복: {result['duplicate_seqs'] or 'None'}")
    print(f"  정렬 상태: {'✅ 정렬됨' if result['is_sorted'] else '❌ 비정렬'}")
    print(f"  결과: {'✅ PASS' if result['status'] == 'PASS' else '❌ FAIL'}")

    return result


def validate_timestamp_consistency(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """타임스탬프 일관성 검증"""
    print("\n=== 타임스탬프 일관성 검증 ===")

    wave_events = [e for e in events if e['event_type'] == 'wave:event']

    if not wave_events:
        return {'status': 'SKIP', 'reason': 'wave:event 없음'}

    timestamps = [e['data']['event']['ts'] for e in wave_events]
    timestamps_sorted = sorted(timestamps)

    # 비정렬 구간 찾기
    violations = []
    for i in range(1, len(timestamps)):
        if timestamps[i] < timestamps[i-1]:
            violations.append({
                'index': i,
                'prev_ts': timestamps[i-1],
                'curr_ts': timestamps[i],
                'prev_waveSeq': wave_events[i-1]['data']['waveSeq'],
                'curr_waveSeq': wave_events[i]['data']['waveSeq']
            })

    result = {
        'status': 'PASS' if not violations else 'FAIL',
        'total_events': len(wave_events),
        'is_sorted': timestamps == timestamps_sorted,
        'violations': violations[:5]  # 최대 5개만
    }

    print(f"  총 이벤트: {result['total_events']}")
    print(f"  타임스탬프 정렬: {'✅ 정렬됨' if result['is_sorted'] else '❌ 비정렬'}")
    if violations:
        print(f"  위반 건수: {len(violations)}")
        for v in result['violations']:
            print(f"    - waveSeq {v['prev_waveSeq']} → {v['curr_waveSeq']}: ts 역전")
    print(f"  결과: {'✅ PASS' if result['status'] == 'PASS' else '❌ FAIL'}")

    return result


def validate_event_deduplication(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """이벤트 중복 방지 검증"""
    print("\n=== 이벤트 중복 방지 검증 ===")

    wave_events = [e for e in events if e['event_type'] == 'wave:event']

    if not wave_events:
        return {'status': 'SKIP', 'reason': 'wave:event 없음'}

    # (roleId, seq) 키로 중복 체크
    event_keys = defaultdict(list)
    for i, e in enumerate(wave_events):
        role_id = e['data']['event']['roleId']
        seq = e['data']['event']['seq']
        key = f"{role_id}:{seq}"
        event_keys[key].append({
            'index': i,
            'waveSeq': e['data']['waveSeq'],
            'sessionId': e['data']['sessionId']
        })

    duplicates = {k: v for k, v in event_keys.items() if len(v) > 1}

    result = {
        'status': 'PASS' if not duplicates else 'FAIL',
        'total_events': len(wave_events),
        'unique_keys': len(event_keys),
        'duplicate_keys': list(duplicates.keys())[:5],  # 최대 5개만
        'duplicate_details': {k: v for k, v in list(duplicates.items())[:3]}
    }

    print(f"  총 이벤트: {result['total_events']}")
    print(f"  고유 키: {result['unique_keys']}")
    print(f"  중복 키: {len(duplicates)}개")
    if duplicates:
        for key, occurrences in list(duplicates.items())[:3]:
            print(f"    - {key}: {len(occurrences)}회 전송")
            for occ in occurrences:
                print(f"      waveSeq={occ['waveSeq']}, sessionId={occ['sessionId']}")
    print(f"  결과: {'✅ PASS' if result['status'] == 'PASS' else '❌ FAIL'}")

    return result


def validate_from_parameter(wave_id: str, base_url: str, max_wave_seq: int) -> Dict[str, Any]:
    """from 파라미터 검증 (히스토리 replay)"""
    print("\n=== from 파라미터 검증 ===")

    if max_wave_seq < 5:
        return {'status': 'SKIP', 'reason': f'waveSeq가 너무 작음 (max={max_wave_seq})'}

    # from=max_wave_seq-5 로 재접속
    from_seq = max_wave_seq - 5
    url = f"{base_url}/api/waves/{wave_id}/stream?from={from_seq}"

    print(f"  재접속: from={from_seq}")
    events = parse_sse_stream(url, max_events=20, timeout_sec=10)

    wave_events = [e for e in events if e['event_type'] == 'wave:event']

    if not wave_events:
        return {'status': 'FAIL', 'reason': 'wave:event 수신 못함'}

    wave_seqs = [e['data']['waveSeq'] for e in wave_events]
    min_received = min(wave_seqs)

    result = {
        'status': 'PASS' if min_received >= from_seq else 'FAIL',
        'from_param': from_seq,
        'min_received_waveSeq': min_received,
        'total_events_received': len(wave_events),
        'wave_seqs': wave_seqs[:10]  # 최대 10개만
    }

    print(f"  from={from_seq}")
    print(f"  수신된 최소 waveSeq: {min_received}")
    print(f"  수신 이벤트 수: {len(wave_events)}")
    print(f"  결과: {'✅ PASS (from 이후 이벤트만 수신)' if result['status'] == 'PASS' else '❌ FAIL (from 이전 이벤트 포함)'}")

    return result


def analyze_event_distribution(events: List[Dict[str, Any]]) -> None:
    """이벤트 분포 분석 (추가 인사이트)"""
    print("\n=== 이벤트 분포 분석 ===")

    event_type_counts = defaultdict(int)
    for e in events:
        event_type_counts[e['event_type']] += 1

    print("  이벤트 타입별 분포:")
    for event_type, count in sorted(event_type_counts.items()):
        print(f"    - {event_type}: {count}개")

    # wave:event 내부의 ActivityEvent 타입 분포
    wave_events = [e for e in events if e['event_type'] == 'wave:event']
    if wave_events:
        activity_type_counts = defaultdict(int)
        role_counts = defaultdict(int)

        for e in wave_events:
            activity_type = e['data']['event']['type']
            role_id = e['data']['event']['roleId']
            activity_type_counts[activity_type] += 1
            role_counts[role_id] += 1

        print("\n  ActivityEvent 타입 분포:")
        for activity_type, count in sorted(activity_type_counts.items()):
            print(f"    - {activity_type}: {count}개")

        print("\n  Role별 이벤트 수:")
        for role_id, count in sorted(role_counts.items()):
            print(f"    - {role_id}: {count}개")


def main():
    wave_id = sys.argv[1] if len(sys.argv) > 1 else "wave-1773318274324"
    base_url = "http://localhost:3001"
    url = f"{base_url}/api/waves/{wave_id}/stream"

    print(f"🔍 SSE 스트림 검증 시작")
    print(f"Wave ID: {wave_id}")
    print(f"URL: {url}\n")

    # 1. 이벤트 수집
    events = parse_sse_stream(url, max_events=50, timeout_sec=20)

    if not events:
        print("\n❌ 이벤트를 수집하지 못했습니다.")
        return

    # 2. 검증 실행
    results = {}
    results['continuity'] = validate_wave_seq_continuity(events)
    results['timestamp'] = validate_timestamp_consistency(events)
    results['deduplication'] = validate_event_deduplication(events)

    # 3. from 파라미터 검증
    wave_events = [e for e in events if e['event_type'] == 'wave:event']
    if wave_events:
        max_wave_seq = max(e['data']['waveSeq'] for e in wave_events)
        results['from_param'] = validate_from_parameter(wave_id, base_url, max_wave_seq)

    # 4. 분포 분석
    analyze_event_distribution(events)

    # 5. 최종 요약
    print("\n" + "="*60)
    print("🎯 검증 결과 요약")
    print("="*60)

    all_passed = all(r['status'] == 'PASS' for r in results.values() if r['status'] != 'SKIP')

    for name, result in results.items():
        status_emoji = '✅' if result['status'] == 'PASS' else ('⏭️' if result['status'] == 'SKIP' else '❌')
        print(f"{status_emoji} {name}: {result['status']}")

    print(f"\n{'🎉 모든 검증 통과!' if all_passed else '⚠️ 일부 검증 실패'}")

    # 6. 결과 파일 저장
    output_path = f"/tmp/sse-validation-{wave_id}.json"
    with open(output_path, 'w') as f:
        json.dump({
            'wave_id': wave_id,
            'validated_at': datetime.now().isoformat(),
            'total_events_collected': len(events),
            'results': results,
            'raw_events': events[:20]  # 최대 20개만 저장
        }, f, indent=2, default=str)

    print(f"\n📄 상세 결과 저장: {output_path}")


if __name__ == "__main__":
    main()
