from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_image_card_accessibility(page: Page):
    # Navigate to the verification page
    page.goto("http://localhost:9002/verify-ux")

    # Wait for the image card to appear
    # The image card has a checkbox with "select image 123" label (from mock data)
    page.get_by_role("checkbox", name="Select image 123").wait_for()

    # Find the assigned indicator. It should now be a button.
    # We assigned it to 2 variants in the mock data.
    indicator = page.get_by_role("button", name="Assigned to 2 variant(s)")

    # Assert it is visible
    expect(indicator).to_be_visible()

    # Take a screenshot
    page.screenshot(path="verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_image_card_accessibility(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
