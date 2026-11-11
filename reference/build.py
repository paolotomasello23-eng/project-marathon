import pathlib, sys
src = pathlib.Path(__file__).parent / 'src'
r = lambda n: (src / n).read_text(encoding='utf-8')
html = r('shell.html')
app = '\n'.join(r(f'app{i}.js') for i in (1, 2, 3, 4))
for key, val in (('/*CSS*/', r('app.css')), ('/*PLAN*/', r('plan.js')), ('/*ENGINE*/', r('engine.js')), ('/*APP*/', app)):
    assert key in html, key
    assert '</script' not in val.lower() and '</style' not in val.lower(), key
    html = html.replace(key, val)
out = pathlib.Path(__file__).parent / 'marathon-project-madrid.html'
out.write_text(html, encoding='utf-8')
(pathlib.Path(__file__).parent / 'test' / 'app.bundle.js').write_text("(function () {\n'use strict';\n" + app + "\n})();\n", encoding='utf-8')
print('built', out, len(html), 'bytes')
