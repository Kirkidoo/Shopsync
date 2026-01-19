from playwright.sync_api import Page, expect, sync_playwright

def verify_ux(page: Page):
  print("Navigating to http://localhost:9002/verify-ux")
  page.goto("http://localhost:9002/verify-ux")
  print("Waiting for heading")
  expect(page.get_by_role("heading", name="Unselected")).to_be_visible()

  print("Waiting for rendering")
  page.wait_for_timeout(2000)

  print(" taking screenshot")
  page.screenshot(path="/home/jules/verification/verification.png")
  print("Done")

if __name__ == "__main__":
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
      verify_ux(page)
    except Exception as e:
      print(f"Error: {e}")
    finally:
      browser.close()
