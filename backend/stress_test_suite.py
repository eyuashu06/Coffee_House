#!/usr/bin/env python3
"""
Coffee House (Buna Hub) - Comprehensive Stress & Failure Mode Testing Suite

Tests the system beyond maximum designed capacity to:
1. Identify throughput ceiling and breaking points.
2. Measure response time degradation under extreme concurrency.
3. Verify rate-limiting / throttling behavior (HTTP 429).
4. Verify database state integrity under concurrent write contention.
5. Fuzz with malformed and boundary inputs to observe failure handling.
6. Verify rapid post-stress recovery.
"""

import sys
import os
import time
import json
import statistics
import threading
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "http://127.0.0.1:8001"

MANAGER_TOKEN = None
try:
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
    django.setup()
    from apps.accounts.models import User
    from apps.accounts.views import issue_tokens_for_user
    mgr = User.objects.filter(role__in=['MANAGER', 'ADMIN']).first()
    if mgr:
        _, access = issue_tokens_for_user(mgr)
        MANAGER_TOKEN = str(access)
except Exception as e:
    pass

class MetricCollector:
    def __init__(self, name):
        self.name = name
        self.latencies = []
        self.status_codes = {}
        self.errors = []
        self.lock = threading.Lock()
        self.start_time = None
        self.end_time = None

    def start(self):
        self.start_time = time.time()

    def record(self, status, latency_ms, error=None):
        with self.lock:
            self.latencies.append(latency_ms)
            self.status_codes[status] = self.status_codes.get(status, 0) + 1
            if error:
                self.errors.append(error)

    def finish(self):
        self.end_time = time.time()

    def report(self):
        total = len(self.latencies)
        duration = (self.end_time - self.start_time) if (self.end_time and self.start_time) else 0.001
        rps = total / duration if duration > 0 else 0
        sorted_lat = sorted(self.latencies) if self.latencies else [0]
        
        def pct(p):
            idx = int(len(sorted_lat) * p / 100)
            return sorted_lat[min(idx, len(sorted_lat) - 1)]

        return {
            "name": self.name,
            "total_requests": total,
            "duration_sec": round(duration, 2),
            "throughput_rps": round(rps, 1),
            "status_distribution": self.status_codes,
            "latency_ms": {
                "min": round(sorted_lat[0], 2) if sorted_lat else 0,
                "median_p50": round(pct(50), 2) if sorted_lat else 0,
                "p95": round(pct(95), 2) if sorted_lat else 0,
                "p99": round(pct(99), 2) if sorted_lat else 0,
                "max": round(sorted_lat[-1], 2) if sorted_lat else 0,
            },
            "error_sample": self.errors[:3]
        }

def make_request(path, method="GET", payload=None, headers=None, cookies=None, timeout=10):
    url = f"{BASE_URL}{path}"
    req_headers = {"User-Agent": "CoffeeHouse-StressTester/1.0"}
    if headers:
        req_headers.update(headers)
    if cookies:
        req_headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
        
    data = None
    if payload is not None:
        if isinstance(payload, (dict, list)):
            data = json.dumps(payload).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        elif isinstance(payload, (str, bytes)):
            data = payload if isinstance(payload, bytes) else payload.encode("utf-8")

    req = Request(url, data=data, headers=req_headers, method=method)
    
    t0 = time.time()
    try:
        with urlopen(req, timeout=timeout) as resp:
            lat = (time.time() - t0) * 1000
            body = resp.read()
            return resp.status, lat, body, None
    except HTTPError as e:
        lat = (time.time() - t0) * 1000
        body = e.read()
        return e.code, lat, body, str(e)
    except URLError as e:
        lat = (time.time() - t0) * 1000
        return 0, lat, b"", f"URLError: {e.reason}"
    except Exception as e:
        lat = (time.time() - t0) * 1000
        return 0, lat, b"", f"Exception: {str(e)}"

def login_user(username, password):
    status, lat, body, err = make_request("/api/v1/auth/login/", method="POST", payload={
        "username": username,
        "password": password
    })
    # Extract cookies from response header if needed, or token
    if status == 200:
        try:
            data = json.loads(body)
            # Check for access token in cookies
            return True, data
        except Exception:
            return True, {}
    return False, None

def run_stress_test():
    results = {}

    print("======================================================================")
    print(" 🚀 STARTING COFFEE HOUSE STRESS & BREAKING POINT TEST SUITE")
    print(f" Target Server: {BASE_URL}")
    print("======================================================================\n")

    # ------------------------------------------------------------------
    # TEST 1: Baseline Read Performance (Normal Capacity)
    # ------------------------------------------------------------------
    print("--- [Test 1] Baseline Read Latency (50 requests, 5 concurrency) ---")
    m1 = MetricCollector("Baseline Reads (Menu Items)")
    m1.start()
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(make_request, "/api/v1/menu/items/") for _ in range(50)]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m1.record(status, lat, err)
    m1.finish()
    rep1 = m1.report()
    results["test1_baseline"] = rep1
    print(f"  Throughput: {rep1['throughput_rps']} RPS | p50: {rep1['latency_ms']['median_p50']}ms | p95: {rep1['latency_ms']['p95']}ms | Status: {rep1['status_distribution']}\n")

    # ------------------------------------------------------------------
    # TEST 2: High Concurrency Read Saturation (Extreme Capacity)
    # ------------------------------------------------------------------
    print("--- [Test 2] Extreme Concurrency Read Flood (400 requests, 50 concurrency) ---")
    m2 = MetricCollector("High Concurrency Reads (/menu/items/)")
    m2.start()
    with ThreadPoolExecutor(max_workers=50) as pool:
        futures = [pool.submit(make_request, "/api/v1/menu/items/?page_size=20") for _ in range(400)]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m2.record(status, lat, err)
    m2.finish()
    rep2 = m2.report()
    results["test2_high_concurrency_reads"] = rep2
    print(f"  Throughput: {rep2['throughput_rps']} RPS | p50: {rep2['latency_ms']['median_p50']}ms | p95: {rep2['latency_ms']['p95']}ms | Max: {rep2['latency_ms']['max']}ms | Status: {rep2['status_distribution']}\n")

    # ------------------------------------------------------------------
    # TEST 3: Rate Limiting & Throttling Enforcement (Burst Beyond Capacity)
    # Designed limit: order_create = 15/min
    # ------------------------------------------------------------------
    print("--- [Test 3] Throttling Stress: Order Creation Burst (60 requests burst from single IP) ---")
    print("  Designed Rate Limit: 15/min. Testing if 429 is enforced and protects backend...")
    m3 = MetricCollector("Order Creation Burst Throttling")
    order_payload = {
        "order_type": "DELIVERY",
        "delivery_address": "Piassa, Addis Ababa",
        "contact_name": "Stress Test Customer",
        "contact_phone": "+251911223344",
        "items": [
            {"menu_item": 1, "quantity": 2}
        ]
    }
    m3.start()
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(make_request, "/api/v1/orders/", method="POST", payload=order_payload) for _ in range(60)]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m3.record(status, lat, err)
    m3.finish()
    rep3 = m3.report()
    results["test3_order_throttling"] = rep3
    print(f"  Results: Total {rep3['total_requests']} requests in {rep3['duration_sec']}s")
    print(f"  Status breakdown: {rep3['status_distribution']}")
    print(f"  Throttled (429): {rep3['status_distribution'].get(429, 0)} | Created (201): {rep3['status_distribution'].get(201, 0)}\n")

    # ------------------------------------------------------------------
    # TEST 4: Auth Brute-Force & Credential Stuffing Stress
    # Designed limit: auth_login = 20/min
    # ------------------------------------------------------------------
    print("--- [Test 4] Auth Login Brute Force Flood (50 attempts, 10 concurrency) ---")
    m4 = MetricCollector("Auth Login Flood")
    m4.start()
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [
            pool.submit(make_request, "/api/v1/auth/login/", method="POST", payload={
                "username": f"attacker_{i}",
                "password": f"wrongpass_{i}"
            })
            for i in range(50)
        ]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m4.record(status, lat, err)
    m4.finish()
    rep4 = m4.report()
    results["test4_auth_throttling"] = rep4
    print(f"  Status breakdown: {rep4['status_distribution']}")
    print(f"  Throttled (429): {rep4['status_distribution'].get(429, 0)} | Auth Failures (400/401): {rep4['status_distribution'].get(400, 0) + rep4['status_distribution'].get(401, 0)}\n")

    # ------------------------------------------------------------------
    # TEST 5: AI Assistant Concurrency & Natural Language Parsing Flood
    # ------------------------------------------------------------------
    print("--- [Test 5] AI Assistant Chat Concurrency Flood (50 requests, 15 concurrency) ---")
    m5 = MetricCollector("AI Assistant Concurrency")
    prompts = [
        "What single-origin coffees do you have from Yirgacheffe?",
        "Can I order 2 caramel macchiatos and a tiramisu to Bole?",
        "የዛሬው ልዩ የቡና ዓይነት ምንድነው?",
        "How much is the double smash burger and cold brew?",
        "Do you have vegan milk options?",
        "Where is your cafe located and what are your opening hours?",
    ]
    m5.start()
    with ThreadPoolExecutor(max_workers=15) as pool:
        futures = [
            pool.submit(make_request, "/api/v1/assistant/message/", method="POST", payload={
                "session_id": f"stress_session_{i % 5}",
                "message": prompts[i % len(prompts)]
            })
            for i in range(50)
        ]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m5.record(status, lat, err)
    m5.finish()
    rep5 = m5.report()
    results["test5_ai_assistant"] = rep5
    print(f"  Throughput: {rep5['throughput_rps']} RPS | p50: {rep5['latency_ms']['median_p50']}ms | p95: {rep5['latency_ms']['p95']}ms | Status: {rep5['status_distribution']}\n")

    # ------------------------------------------------------------------
    # TEST 6: High Concurrency State Contention & Race Condition Stress
    # ------------------------------------------------------------------
    print("--- [Test 6] Database State Contention Stress ---")
    print("  Creating an order, then firing 25 concurrent requests to approve payment simultaneously...")
    # First create a test order directly
    status_create, _, body_create, _ = make_request("/api/v1/orders/", method="POST", payload={
        "order_type": "DINE_IN",
        "table_number": "Table 99",
        "contact_name": "Contention Test",
        "contact_phone": "+251911999999",
        "items": [{"menu_item": 1, "quantity": 1}]
    })
    order_id = None
    if status_create == 201:
        try:
            order_id = json.loads(body_create).get("id")
        except Exception:
            pass

    if not order_id:
        print("  Notice: Rate limited on direct order creation, using fallback order ID 1")
        order_id = 1

    mgr_headers = {"Authorization": f"Bearer {MANAGER_TOKEN}"} if MANAGER_TOKEN else {}

    m6 = MetricCollector("Payment Approval Race Condition")
    m6.start()
    with ThreadPoolExecutor(max_workers=25) as pool:
        futures = [
            pool.submit(make_request, f"/api/v1/payments/{order_id}/approve/", method="POST", payload={
                "order_id": order_id,
                "payment_method": "cash",
                "notes": f"Concurrent thread #{i}"
            }, headers=mgr_headers)
            for i in range(25)
        ]
        for f in as_completed(futures):
            status, lat, body, err = f.result()
            m6.record(status, lat, err)
    m6.finish()
    rep6 = m6.report()
    results["test6_contention"] = rep6
    print(f"  Contention results: {rep6['status_distribution']}")
    print(f"  Duration: {rep6['duration_sec']}s | Latency p50: {rep6['latency_ms']['median_p50']}ms\n")

    # ------------------------------------------------------------------
    # TEST 7: Malformed Inputs, Fuzzing & Boundary Chaos
    # ------------------------------------------------------------------
    print("--- [Test 7] Malformed Payloads & Boundary Stress (Fuzzing) ---")
    sql_payload = quote("' OR '1'='1'--")
    fuzz_cases = [
        ("Huge 500KB JSON String", "/api/v1/orders/", "POST", {"notes": "A" * 500_000, "items": []}, {}),
        ("Negative Quantity", "/api/v1/orders/", "POST", {"items": [{"menu_item": 1, "quantity": -99}]}, {}),
        ("Zero Quantity", "/api/v1/orders/", "POST", {"items": [{"menu_item": 1, "quantity": 0}]}, {}),
        ("SQL Injection string in search", f"/api/v1/orders/?search={sql_payload}", "GET", None, mgr_headers),
        ("Invalid JSON syntax", "/api/v1/orders/", "POST", "{invalid_json: true,", {}),
        ("Invalid status transition", f"/api/v1/orders/{order_id}/update_status/", "POST", {"status": "NOT_A_REAL_STATUS"}, mgr_headers),
        ("Negative prep minutes", f"/api/v1/orders/{order_id}/update_status/", "POST", {"status": "ACCEPTED", "estimated_prep_minutes": -50}, mgr_headers),
        ("Massive prep minutes (999999)", f"/api/v1/orders/{order_id}/update_status/", "POST", {"status": "ACCEPTED", "estimated_prep_minutes": 999999}, mgr_headers),
        ("Oversized Unicode bomb", "/api/v1/assistant/message/", "POST", {"message": "💥" * 50_000}, {}),
    ]

    m7 = MetricCollector("Malformed Payload Resilience")
    m7.start()
    for item in fuzz_cases:
        label, path, method, payload, req_headers = item
        status, lat, body, err = make_request(path, method=method, payload=payload, headers=req_headers)
        m7.record(status, lat, err)
        handled_safely = (status != 500 and status != 0)
        print(f"  [{label}] -> HTTP {status} ({lat:.1f}ms) | Handled safely (no 500): {handled_safely}")
    m7.finish()
    rep7 = m7.report()
    results["test7_fuzzing"] = rep7
    print(f"  Fuzzing summary status codes: {rep7['status_distribution']}\n")

    # ------------------------------------------------------------------
    # TEST 8: Immediate Post-Stress Recovery Test
    # ------------------------------------------------------------------
    print("--- [Test 8] Post-Stress System Health & Recovery Verification ---")
    print("  Testing system latency immediately after all burst floods complete...")
    m8 = MetricCollector("Post-Stress Health Check")
    m8.start()
    for _ in range(10):
        status, lat, body, err = make_request("/api/v1/menu/items/")
        m8.record(status, lat, err)
        time.sleep(0.05)
    m8.finish()
    rep8 = m8.report()
    results["test8_recovery"] = rep8
    print(f"  Post-stress p50: {rep8['latency_ms']['median_p50']}ms | p95: {rep8['latency_ms']['p95']}ms | 100% OK: {rep8['status_distribution'].get(200, 0) == 10}\n")

    print("======================================================================")
    print(" 🏁 STRESS TEST RUN COMPLETE")
    print("======================================================================")

    with open("/home/eyuel/coffe/Coffee_House/stress_test_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Detailed metrics saved to stress_test_results.json")

if __name__ == "__main__":
    run_stress_test()
