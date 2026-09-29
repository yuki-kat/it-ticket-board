# Accessibility

IT Ticket Board is designed with accessibility in mind to serve all users, including those with disabilities. This page documents our accessibility features and commitment.

## Features

### Keyboard Navigation
- **Tab navigation**: All interactive elements (buttons, links, form inputs, menus) are reachable via Tab key
- **Escape to close**: Press Escape to close any open dialog, menu, or popup
- **Enter/Space activation**: Use Enter or Space to activate buttons and toggle options
- **Arrow keys**: Navigate within select dropdowns and carousel-like elements
- **Ctrl+Shift+D**: Toggle the debug log on/off (useful for developers)

### Screen Reader Support
- **Semantic HTML**: Pages use proper heading hierarchy (h1, h2, h3), lists, and form labels
- **ARIA labels**: Buttons and icon-only controls have descriptive `aria-label` attributes
- **Live regions**: Dynamic content updates are announced to screen readers
- **Form labels**: All inputs have associated labels to announce their purpose

### Visual Design
- **Color contrast**: Text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- **Color not sole indicator**: Information is not conveyed by color alone; status badges include text
- **Focus indicators**: Keyboard focus has a visible outline on all interactive elements
- **Responsive sizing**: Touch targets are at least 44×44 pixels for mobile

### Mobile & Tablet
- **Responsive layout**: Adapts gracefully from phone (375px) to desktop (1920px+)
- **Touch-friendly**: Buttons and controls are appropriately sized for touch interaction
- **Text zoom**: Content scales properly when browser zoom is applied
- **Orientation**: Works in both portrait and landscape on mobile devices

## Known Limitations

- **Vercel authentication** (optional sign-in feature) may have different accessibility standards
- **Excel export** creates files that require a separate desktop application to open
- **PDF generation** (if added in future) may require additional accessible format support

## Testing

Accessibility is tested across:
- Chrome, Firefox, Safari, and Edge browsers
- Keyboard-only navigation
- Screen readers (NVDA, JAWS, VoiceOver)
- Mobile browsers on iOS and Android
- Zoom levels from 100% to 200%

## Reporting Issues

Found an accessibility barrier? Please [open an issue](https://github.com/yuki-kat/it-ticket-board/issues) with:
- Device and browser you're using
- What you were trying to do
- What went wrong
- How you accessed the app (keyboard, screen reader, mouse, touch, etc.)

## Standards

This project aims to comply with:
- **WCAG 2.1 Level AA**: Web Content Accessibility Guidelines
- **Section 508**: US federal accessibility requirements
- **EN 301 549**: European accessibility standard

## Resources

- [WebAIM: Web Accessibility Introduction](https://webaim.org/intro/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Keyboard Navigation Patterns](https://www.w3.org/WAI/test-evaluate/involving-users/)
