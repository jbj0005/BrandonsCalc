/**
 * Hover Behaviors Registry
 *
 * Centralizes all hover interaction behaviors in the application.
 * Makes it easy to find conflicts, understand delays, and debug hover issues.
 */

import { Feature, FeatureConfig } from './types';

/**
 * Hover behavior configurations
 */
export const HOVER_CONFIGS = {
  /** Tooltip hover delay */
  TOOLTIP_DELAY: 200,                // ms

  /** Slider hover delays */
  SLIDER_HOVER_ENABLE: 0,            // Immediate

  /** Button hover */
  BUTTON_HOVER: 0,                   // Immediate (CSS transition)

  /** Dropdown menu hover */
  MENU_ITEM_HOVER: 0,                // Immediate (CSS transition)

  /** Accordion hover preview */
  ACCORDION_TRANSITION: 200,         // ms (CSS transition duration)
} as const;

/**
 * All hover behavior features
 */
export const hoverFeatures: Feature[] = [
  {
    id: 'hover-profile-dropdown-open',
    name: '**REMOVED** Profile Dropdown Hover to Open',
    description: 'REMOVED: Replaced with click-only behavior for better mobile UX. Previous implementation used hover with 200ms delay.',
    category: 'hover',
    location: [],
    dependencies: [],
    triggers: [],
    effects: ['FEATURE REMOVED'],
    config: {},
    debugging: [
      {
        issue: 'Feature was removed',
        solution: 'Profile dropdown now uses click-only for mobile-friendly UX. See click-profile-dropdown-toggle feature.',
      },
    ],
  },

  {
    id: 'hover-profile-dropdown-stay-open',
    name: '**REMOVED** Profile Dropdown Stay Open on Hover',
    description: 'REMOVED: No longer needed since profile dropdown is click-only.',
    category: 'hover',
    location: [],
    dependencies: [],
    triggers: [],
    effects: ['FEATURE REMOVED'],
    config: {},
  },

  {
    id: 'hover-section-accordion-preview',
    name: 'Dropdown Section Accordion Hover Preview',
    description: 'Hover over dropdown sections (My Profile, My Garage, Saved Vehicles) shows preview with color highlighting and animations. Click still required to expand. Disabled on touch devices for better mobile UX.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/UserProfileDropdown.tsx',
        lines: '233-261',
        function: 'My Profile section hover handlers',
      },
      {
        file: 'src/ui/components/UserProfileDropdown.tsx',
        lines: '266-299',
        function: 'My Garage section hover handlers',
      },
      {
        file: 'src/ui/components/UserProfileDropdown.tsx',
        lines: '304-337',
        function: 'Saved Vehicles section hover handlers',
      },
      {
        file: 'src/hooks/useIsTouchDevice.ts',
        function: 'Touch device detection',
      },
    ],
    dependencies: [
      {
        type: 'hook',
        name: 'useIsTouchDevice',
        required: true,
        notes: 'Disables hover on touch devices',
      },
    ],
    triggers: [
      'Mouse enters section button (desktop only)',
      'isTouchDevice check prevents on mobile',
    ],
    effects: [
      'Changes background to section color (blue/green/purple-50)',
      'Subtle scale transform (1.01x)',
      'Icon scale (1.05x) and shadow enhancement',
      'Text color changes to section color',
      'Arrow slides right and changes color',
      'Badge changes to section color scheme',
      'Smooth 200ms CSS transitions',
    ],
    config: {
      delay: HOVER_CONFIGS.ACCORDION_TRANSITION,
    },
    examples: [
      `
const isTouchDevice = useIsTouchDevice();
const [hoveredSection, setHoveredSection] = useState<Section | null>(null);

<button
  onClick={() => setActiveSection('profile')}
  onMouseEnter={() => !isTouchDevice && setHoveredSection('profile')}
  onMouseLeave={() => !isTouchDevice && setHoveredSection(null)}
  className={\`transition-all duration-200 \${
    hoveredSection === 'profile'
      ? 'bg-blue-50 scale-[1.01]'
      : 'hover:bg-gray-50/80'
  }\`}
>
  {/* Section content with conditional styling */}
</button>
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Hover effects showing on mobile',
        solution: 'Check that isTouchDevice is working. Should return true on touch devices and disable onMouseEnter.',
      },
      {
        issue: 'Transitions feel laggy',
        solution: 'Reduce ACCORDION_TRANSITION duration in HOVER_CONFIGS (currently 200ms).',
      },
    ],
  },

  {
    id: 'hover-tooltip',
    name: 'Tooltip Hover',
    description: 'Shows tooltips after a delay when hovering over elements. Prevents tooltips from appearing on brief hovers.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/Tooltip.tsx',
        lines: '45-82',
        function: 'Tooltip component',
      },
    ],
    dependencies: [],
    triggers: [
      'Mouse enters trigger element',
      'After 200ms delay (configurable)',
    ],
    effects: [
      'Shows tooltip',
      'Positions tooltip relative to trigger',
    ],
    config: {
      delay: HOVER_CONFIGS.TOOLTIP_DELAY,
    },
    examples: [
      `
<Tooltip content="Helpful info" delay={200}>
  <button>Hover me</button>
</Tooltip>
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Tooltip appears too quickly',
        solution: 'Increase delay prop (default 200ms)',
      },
      {
        issue: 'Tooltip position is wrong',
        solution: 'Check position prop (top, bottom, left, right)',
      },
    ],
  },

  {
    id: 'hover-slider-tooltip',
    name: 'Slider Hover Tooltip',
    description: 'Shows payment preview tooltip when hovering over slider. Displays monthly payment and difference from baseline.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/EnhancedSlider.tsx',
        lines: '204-232',
        function: 'Slider tooltip rendering',
      },
      {
        file: 'src/ui/components/EnhancedSlider.tsx',
        lines: '143-153',
        function: 'handleMouseEnter, handleMouseLeave',
      },
    ],
    dependencies: [
      {
        type: 'hook',
        name: 'useSliderBaseline',
        required: false,
        notes: 'For baseline tracking and payment diff',
      },
    ],
    triggers: [
      'Mouse enters slider',
    ],
    effects: [
      'Shows tooltip with payment preview',
      'Tooltip follows slider thumb position',
      'Shows +/- diff from baseline',
    ],
    config: {
      delay: 0, // Immediate
    },
    examples: [
      `
// Slider with hover tooltip
const [isHovering, setIsHovering] = useState(false);

<div
  onMouseEnter={() => setIsHovering(true)}
  onMouseLeave={() => setIsHovering(false)}
>
  {isHovering && (
    <div className="tooltip">
      Monthly: {formatCurrency(monthlyPayment)}
      {diff !== 0 && <span>{diff > 0 ? '+' : ''}{diff}</span>}
    </div>
  )}
</div>
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Tooltip position jumps around',
        solution: 'Check that tooltip positioning uses slider thumb position',
      },
      {
        issue: 'Diff calculation is wrong',
        solution: 'Verify baseline value is set correctly via useSliderBaseline',
      },
    ],
  },

  {
    id: 'hover-button-states',
    name: 'Button Hover States',
    description: 'Changes button appearance on hover for all button variants. Pure CSS transitions.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/Button.tsx',
        lines: '45-80',
        function: 'Button className logic',
      },
    ],
    dependencies: [],
    triggers: [
      'Mouse enters button',
    ],
    effects: [
      'Changes background color',
      'Smooth transition animation',
    ],
    config: {
      delay: 0, // CSS transition
    },
    examples: [
      `
// Button variants with hover states
<Button variant="primary">    {/* hover:bg-blue-700 */}
<Button variant="secondary">  {/* hover:bg-gray-100 */}
<Button variant="outline">    {/* hover:bg-gray-50 */}
<Button variant="danger">     {/* hover:bg-red-700 */}
      `.trim(),
    ],
  },

  {
    id: 'hover-dropdown-menu-items',
    name: 'Dropdown Menu Item Hover',
    description: 'Highlights dropdown menu items on hover. Pure CSS transitions.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/Dropdown.tsx',
        lines: '113-145',
        function: 'Menu item rendering',
      },
    ],
    dependencies: [],
    triggers: [
      'Mouse enters menu item',
    ],
    effects: [
      'Changes background to gray-100',
      'Danger items show red background',
    ],
    config: {
      delay: 0, // CSS transition
    },
    examples: [
      `
<button className="hover:bg-gray-100">
  Menu Item
</button>

<button className="hover:bg-red-50 text-red-600">
  Delete (danger)
</button>
      `.trim(),
    ],
  },

  {
    id: 'hover-profile-dropdown-sections',
    name: 'Profile Dropdown Section Hover (UPDATED)',
    description: 'UPDATED: Now uses accordion hover preview (see hover-section-accordion-preview). Sections show color preview on hover, click to expand. Disabled on touch devices.',
    category: 'hover',
    location: [
      {
        file: 'src/ui/components/UserProfileDropdown.tsx',
        lines: '231-337',
        function: 'Section buttons with accordion hover',
      },
    ],
    dependencies: [
      {
        type: 'feature',
        name: 'hover-section-accordion-preview',
        required: true,
      },
    ],
    triggers: [
      'Mouse enters section button (desktop only)',
    ],
    effects: [
      'Shows accordion preview animation',
      'Click still required to open section',
    ],
    config: {
      delay: HOVER_CONFIGS.ACCORDION_TRANSITION,
    },
    debugging: [
      {
        issue: 'Sections open on hover instead of click',
        solution: 'Check that onClick is used for expansion, onMouseEnter only for preview',
      },
      {
        issue: 'Hover working on mobile',
        solution: 'Ensure isTouchDevice check is wrapping onMouseEnter: !isTouchDevice && setHoveredSection(...)',
      },
    ],
  },
];

/**
 * Get hover feature by ID
 */
export function getHoverFeature(id: string): Feature | undefined {
  return hoverFeatures.find((f) => f.id === id);
}

/**
 * Get all hover features for a specific file
 */
export function getHoverFeaturesByFile(file: string): Feature[] {
  return hoverFeatures.filter((f) =>
    f.location.some((loc) => loc.file.includes(file))
  );
}

/**
 * Get all hover features with delays
 */
export function getHoverFeaturesWithDelays(): Feature[] {
  return hoverFeatures.filter((f) => f.config && f.config.delay && f.config.delay > 0);
}
