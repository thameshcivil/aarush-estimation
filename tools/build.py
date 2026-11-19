"""Build the single-file web app into www/ (used by GitHub Pages and the Android app)."""
import subprocess, glob as _g
import shutil, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = 'www'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
def scr(path):
    return '<script>\n' + open(path, encoding='utf-8').read().replace('</script>', '<\\/script>') + '\n</script>'
h = open('src/index.html', encoding='utf-8').read()
h = h.replace('<!--EXCELJS-->', scr('node_modules/exceljs/dist/exceljs.min.js') + '\n' + scr('node_modules/jszip/dist/jszip.min.js'))
h = h.replace('<!--CALC-->', scr('src/calc.js')).replace('<!--EXCEL-->', scr('src/excel.js') + '\n' + scr('src/rabimport.js') + '\n' + scr('src/xlfill.js') + '\n' + scr('src/xlpatch.js'))
h = h.replace('<!--APP-->', '\n'.join(scr('src/%s.js' % f) for f in ('app1', 'app2', 'app3', 'app4', 'app5', 'app6', 'app7', 'app8', 'app9', 'app10', 'app11', 'boot')))
open(OUT + '/index.html', 'w', encoding='utf-8').write(h)
for f in os.listdir('assets'):
    shutil.copy('assets/' + f, OUT + '/' + f)
open(OUT + '/.nojekyll', 'w').close()
print('built', OUT + '/index.html', os.path.getsize(OUT + '/index.html'), 'bytes')

# syntax check every source file so a broken file never ships
for f in sorted(_g.glob('src/*.js')):
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit('SYNTAX ERROR in ' + f + '\n' + r.stderr)
print('syntax ok')
