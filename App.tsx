import './index.css';
import { LiveAPIProvider } from './contexts/LiveAPIContext';
import AvatarControlTray from './components/lesson/AvatarControlTray';

function App() {
  return (
    <LiveAPIProvider>
      <main>
        <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <AvatarControlTray />
        </div>
      </main>
    </LiveAPIProvider>
  );
}

export default App;
