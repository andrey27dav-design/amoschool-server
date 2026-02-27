#!/usr/bin/env python3
"""Fix entity_id type: must be int, not string, for Kommo API tasks and notes."""

PATH = '/var/www/amoschool/backend/src/services/batchMigrationService.js'

with open(PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

fixes = {
    # line 731 (0-based 730): tasks entity_id — 12-space indent
    730: (
        "            tt.entity_id   = leadIdMap[String(t.entity_id)];\n",
        "            tt.entity_id   = Number(leadIdMap[String(t.entity_id)]);\n"
    ),
    # line 760 (0-based 759): lead notes entity_id — 12-space indent
    759: (
        "            entity_id:  kId,\n",
        "            entity_id:  Number(kId),\n"
    ),
    # line 787 (0-based 786): contact notes entity_id — 12-space indent
    786: (
        "            entity_id:  kContactId,\n",
        "            entity_id:  Number(kContactId),\n"
    ),
}

for ln_0, (old, new) in fixes.items():
    actual = lines[ln_0]
    if actual == old:
        lines[ln_0] = new
        print(f"FIX L{ln_0+1}: OK")
    else:
        print(f"MISMATCH L{ln_0+1}: expected  {repr(old)}")
        print(f"                   got       {repr(actual)}")

with open(PATH, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Saved.")
