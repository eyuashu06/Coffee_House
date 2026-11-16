import os
import sys
import types

# Ensure virtualenv site-packages are loaded in sandbox
venv_packages = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv/lib/python3.12/site-packages')
if os.path.exists(venv_packages) and venv_packages not in sys.path:
    sys.path.insert(0, venv_packages)

try:
    import PIL._imaging
except ImportError:
    class MockImaging(types.ModuleType):
        PILLOW_VERSION = '12.3.0'
        def __getattr__(self, name):
            return lambda *args, **kwargs: None
    sys.modules.setdefault('PIL._imaging', MockImaging('PIL._imaging'))

def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
