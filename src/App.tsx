import { Provider } from 'jotai';

import GameViewport from './GameEngine/GameViewport';
import DebugOptions from './DebugOptions/DebugOptions';
import FPSCounter from './FpsCounter';
import { store } from './store';

function App() {
  return (
    <Provider store={store}>
      <div className="bg-gray-600 min-h-screen">
        <FPSCounter />
        <GameViewport />
        <DebugOptions />
      </div>
    </Provider>
  );
}

export default App;
