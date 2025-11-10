/**
 * Modal Triggers Registry
 *
 * Centralizes all modal open/close behaviors.
 */

import { Feature } from './types';

export const modalFeatures: Feature[] = [
  {
    id: 'modal-outside-click',
    name: 'Modal Close on Outside Click',
    description: 'Closes modals when clicking the backdrop (configurable).',
    category: 'modal',
    location: [
      { file: 'src/ui/components/Modal.tsx', lines: '55-62', function: 'Backdrop click handler' },
    ],
    dependencies: [],
    triggers: ['Click on backdrop'],
    effects: ['Closes modal if closeOnBackdropClick=true'],
    config: {},
  },

  {
    id: 'modal-focus-trap',
    name: 'Modal Focus Trap',
    description: 'Traps focus within modal. Auto-focuses on open, restores focus on close.',
    category: 'modal',
    location: [
      { file: 'src/ui/components/Modal.tsx', lines: '67-131', function: 'Focus management' },
    ],
    dependencies: [],
    triggers: ['Modal opens', 'Modal closes'],
    effects: [
      'Auto-focuses modal on open',
      'Traps Tab navigation within modal',
      'Restores previous focus on close',
    ],
    config: {},
  },

  {
    id: 'modal-body-scroll-lock',
    name: 'Modal Body Scroll Lock',
    description: 'Prevents body scrolling when modal is open.',
    category: 'modal',
    location: [
      { file: 'src/ui/components/Modal.tsx', lines: '79, 89', function: 'Body scroll lock' },
    ],
    dependencies: [],
    triggers: ['Modal opens', 'Modal closes'],
    effects: [
      'Sets body overflow:hidden on open',
      'Restores body overflow on close',
    ],
    config: {},
  },

  {
    id: 'dropdown-outside-click',
    name: 'Dropdown Close on Outside Click',
    description: 'Closes dropdowns when clicking outside.',
    category: 'modal',
    location: [
      { file: 'src/ui/components/Dropdown.tsx', lines: '46-60', function: 'Outside click handler' },
      { file: 'src/ui/components/UserProfileDropdown.tsx', lines: '69-81', function: 'Outside click handler' },
    ],
    dependencies: [],
    triggers: ['Click outside dropdown'],
    effects: ['Closes dropdown'],
    config: {},
  },
];

export function getModalFeature(id: string): Feature | undefined {
  return modalFeatures.find((f) => f.id === id);
}
