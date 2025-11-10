/**
 * Click Handlers Registry
 *
 * Centralizes all click interaction behaviors in the application.
 */

import { Feature } from './types';

export const clickFeatures: Feature[] = [
  {
    id: 'click-profile-dropdown-toggle',
    name: 'Profile Dropdown Click Toggle',
    description: 'Toggles the profile dropdown open/closed when clicking the profile button. Mobile-friendly, click-only behavior.',
    category: 'click',
    location: [
      {
        file: 'src/CalculatorApp.tsx',
        lines: '662-665',
        function: 'Profile button onClick handler',
      },
    ],
    dependencies: [
      {
        type: 'component',
        name: 'UserProfileDropdown',
        required: true,
      },
    ],
    triggers: [
      'Click on profile button in header',
    ],
    effects: [
      'Toggles dropdown visibility',
      'Works on all devices (desktop + mobile)',
    ],
    config: {},
    examples: [
      `
<button
  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 hover:bg-gray-700"
>
  {currentUser ? profile?.full_name : 'Sign In'}
</button>
      `.trim(),
    ],
    debugging: [
      {
        issue: 'Dropdown not toggling',
        solution: 'Check showProfileDropdown state. Should toggle between true/false on click.',
      },
    ],
  },

  {
    id: 'click-section-expand',
    name: 'Dropdown Section Click to Expand',
    description: 'Expands dropdown sections (My Profile, My Garage, Saved Vehicles) when clicked. Works on all devices.',
    category: 'click',
    location: [
      {
        file: 'src/ui/components/UserProfileDropdown.tsx',
        lines: '232, 265, 303',
        function: 'Section button onClick handlers',
      },
    ],
    dependencies: [],
    triggers: [
      'Click on section button',
    ],
    effects: [
      'Sets activeSection state',
      'Expands section content',
      'Hides section list',
    ],
    config: {},
    examples: [
      `
<button
  onClick={() => setActiveSection('profile')}
  onMouseEnter={() => !isTouchDevice && setHoveredSection('profile')}
>
  My Profile
</button>
      `.trim(),
    ],
  },
];

export function getClickFeature(id: string): Feature | undefined {
  return clickFeatures.find((f) => f.id === id);
}
