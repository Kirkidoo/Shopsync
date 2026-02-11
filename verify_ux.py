from playwright.sync_api import sync_playwright, expect
import time
import json
import os
import uuid
from datetime import datetime

CACHE_DIR = ".cache"
LOG_FILE = os.path.join(CACHE_DIR, "activity-logs.json")

def inject_log():
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

    log_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "level": "INFO",
        "message": "Test Log Entry for UX Verification",
        "details": {"test": "true"}
    }

    with open(LOG_FILE, "w") as f:
        json.dump([log_entry], f)
    print(f"Injected log entry: {log_entry['id']}")

def verify_logs(page):
    page.goto("http://localhost:9002")

    # Wait for the ActivityLogViewer to load.
    expect(page.get_by_text("Activity Logs")).to_be_visible(timeout=30000)

    # Scroll to bottom to see logs
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

    clear_button = page.get_by_role("button", name="Clear")

    # Inject log
    inject_log()

    # Wait for log to appear (polling 5s)
    print("Waiting for log to appear...")
    expect(page.get_by_text("Test Log Entry for UX Verification")).to_be_visible(timeout=10000)

    # Expect enabled
    expect(clear_button).to_be_enabled()
    print("Clear button is enabled.")

    page.screenshot(path="/home/jules/verification/logs_present.png")

    # Click Clear
    clear_button.click()

    # Verify AlertDialog
    expect(page.get_by_role("alertdialog")).to_be_visible()
    expect(page.get_by_text("Clear Activity Logs?")).to_be_visible()
    expect(page.get_by_text("Are you sure you want to clear all logs?")).to_be_visible()

    page.screenshot(path="/home/jules/verification/dialog_open.png")

    # Click Cancel
    page.get_by_role("button", name="Cancel").click()
    expect(page.get_by_role("alertdialog")).not_to_be_visible()
    print("Dialog cancel verification successful.")

    # Open again and confirm
    clear_button.click()
    # "Clear Logs" is the action button text I added
    page.get_by_role("button", name="Clear Logs").click()

    # Verify logs cleared
    # It might take a moment for the component to update logs to []
    expect(page.get_by_text("Test Log Entry for UX Verification")).not_to_be_visible(timeout=5000)
    expect(clear_button).to_be_disabled()
    print("Logs cleared successfully via Dialog.")

    page.screenshot(path="/home/jules/verification/cleared.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_logs(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
