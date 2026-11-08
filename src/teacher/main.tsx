import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { TeacherApp } from './TeacherApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TeacherApp />
  </StrictMode>,
);
