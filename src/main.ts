import 'katex/dist/katex.min.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { startApp } from './shell/app';

// Canvas labels use KaTeX_Math italic; load it before the first frame needs it.
void document.fonts?.load('italic 16px KaTeX_Math');

startApp(document.getElementById('app')!);
