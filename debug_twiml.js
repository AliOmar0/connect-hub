import axios from 'axios';
import fs from 'fs';
try {
    const res = await axios.post('http://localhost:3001/voice');
    fs.writeFileSync('full_twiml.xml', res.data);
} catch (e) {
    fs.writeFileSync('full_twiml.xml', 'ERROR: ' + e.message);
}
