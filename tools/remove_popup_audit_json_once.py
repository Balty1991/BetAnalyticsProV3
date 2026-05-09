from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'cleanup_popup_messages_audit.json'
if p.exists():
    p.unlink()
    print('removed cleanup_popup_messages_audit.json')
else:
    print('already absent')
