# Footer Component Specification

## Overview
The footer of the Browserbase landing page is a multi-column, dark-themed (reddish-orange background) section containing product information, company links, developer resources, and social media integration.

## Visual Reference
![Full Footer](https://sc02.alicdn.com/kf/A47ec88fa44f241c3b048faa2ea449f43Y.png)

## Technical Specifications

### Styles
- **Background Color:** `rgb(210, 48, 3)` (#D23003) - Note: The visual screenshot shows a reddish-orange theme.
- **Typography:**
  - **Font Family:** "PP Neue Montreal", "Helvetica Neue", Arial, sans-serif.
  - **Headers (Product, Company, Developers):**
    - Color: `rgb(255, 255, 255)` (White)
    - Font Size: 14px
    - Font Weight: 700 (Bold)
    - Margin: 0px 0px 8px
  - **Links:**
    - Color: `rgb(255, 255, 255)` (White)
    - Font Size: 14px
    - Font Weight: 400 (Regular)
    - Margin: 0px 0px 4px (for list items)
- **Padding:** 
  - The footer container uses a flexible grid layout with responsive padding.
  - Large decorative text "Browserbase" at the bottom has high visibility.

### Content Structure

#### Link Groups
1. **Product**
   - APIs & SDKs
   - Changelog
   - Docs
2. **Company**
   - Careers
   - Partner with Us
   - Trust & Security
3. **Developers**
   - Blog
   - Github
   - Status

#### Bottom Links
- Privacy policy
- Terms of Service

#### Social Links
- LinkedIn: `https://www.linkedin.com/company/browserbasehq/`
- X (Twitter): `https://x.com/browserbase`
- Instagram: `https://www.instagram.com/browserbase`
- Youtube: `https://www.youtube.com/@browserbase`

### Decorative Elements
- Large "Browserbase" text in the bottom background.
- 3D Cube graphic with "B" logo on the right side.
- "What will you build?" section directly above the main link columns.
- "Get a Demo" and "Get Started" call-to-action buttons in the upper footer area.
