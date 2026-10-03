import re

with open('frontend/src/components/AuthModal.tsx', 'r') as f:
    content = f.read()

replacements = {
    'bg-surface': 'bg-[#131313]',
    'border-outline-variant': 'border-[#514345]',
    'text-on-surface-variant': 'text-[#9e8d8e]',
    'text-on-surface': 'text-[#e5e2e1]',
    'text-tertiary': 'text-[#f7b5be]',
    'bg-tertiary/5': 'bg-[#2b1b1e]',
    'bg-tertiary/15': 'bg-[#2b1b1e]',
    'border-tertiary/30': 'border-[#683941]',
    'border-tertiary/40': 'border-[#683941]',
    'bg-tertiary': 'bg-[#f7b5be]',
    'text-on-tertiary': 'text-[#4e232b]',
    'bg-surface-container/80': 'bg-[#1c1b1b]',
    'focus:border-tertiary': 'focus:border-[#f7b5be]',
    'bg-white/5': 'bg-[#20201f]',
    'bg-white/10': 'bg-[#2c2b2a]',
    'border-white/10': 'border-[#514345]',
    'font-headline': 'font-display',
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open('frontend/src/components/AuthModal.tsx', 'w') as f:
    f.write(content)
