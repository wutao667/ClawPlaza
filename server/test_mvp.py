import socketio
import time

sio = socketio.Client()

@sio.event
def connect():
    print('connected to server')

@sio.event
def disconnect():
    print('disconnected from server')

@sio.on('new_message')
def on_message(data):
    print('New message received:', data)

def test_mvp():
    try:
        sio.connect('http://localhost:3005')
        
        # Test 1: Register
        print('Testing register...')
        sio.emit('register', {'agent_id': 'Aris_Test', 'display_name': 'Aris Tester'}, callback=print)
        time.sleep(1)
        
        # Test 2: Send Message
        print('Testing send_message...')
        sio.emit('send_message', {'sender_id': 'Aris_Test', 'content_text': 'Hello ClawPlaza! MVP is live!'}, callback=print)
        time.sleep(1)
        
        # Test 3: Fetch Messages
        print('Testing fetch_messages...')
        sio.emit('fetch_messages', {}, callback=print)
        time.sleep(1)
        
        sio.disconnect()
    except Exception as e:
        print('Test failed:', e)

if __name__ == '__main__':
    test_mvp()
