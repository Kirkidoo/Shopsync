from playwright.sync_api import sync_playwright, expect

def verify_buttons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            # Visit the page - Port 9002
            page.goto("http://localhost:9002")

            # Wait for content to load
            page.wait_for_selector("text=Select CSV File", timeout=10000)

            # Check for the file list items
            # We look for the button containing "test-file-1.csv"
            # It should be a button now
            file_button = page.locator("button:has-text('test-file-1.csv')")

            # Verify it is visible and is a button
            expect(file_button).to_be_visible()

            # Check attributes
            # We expect type="button" and class containing "w-full text-left"
            # And aria-pressed
            expect(file_button).to_have_attribute("type", "button")

            # Click it to select
            file_button.click()

            # Check aria-pressed changes to true
            expect(file_button).to_have_attribute("aria-pressed", "true")

            # Take screenshot
            page.screenshot(path="/home/jules/verification/audit-stepper-buttons.png")
            print("Verification successful!")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/audit-stepper-error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_buttons()
