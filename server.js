const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();

// Large payload support for image and coordinate processing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Root test route
app.get('/', (req, res) => {
    res.send('Nilavinnool Pro Backend Server is Live and Secure! 🌙');
});

// String Art Calculation & Email Dispatch Endpoint
app.post('/api/generate-and-send', async (req, res) => {
    try {
        const { customerEmail, customerName, nailCount, linesCount, imageData, penaltyWeight, generationMode, portraitMode } = req.body;

        if (!customerEmail || !imageData) {
            return res.status(400).json({ success: false, message: 'Missing required parameters!' });
        }

        // --- Backend String Art Generation Engine Logic ---
        const size = 800;
        const numPins = parseInt(nailCount) || 360;
        const numLines = parseInt(linesCount) || 3000;
        const weight = Math.max(12, Math.floor(8000 / numLines));
        const penaltyAlpha = parseFloat(penaltyWeight) || 0.5;

        let workingData = new Float32Array(size * size);
        for (let i = 0; i < imageData.length && i < workingData.length; i++) {
            workingData[i] = imageData[i];
        }

        let pins = [];
        let r = size / 2 - 2, cx = size / 2, cy = size / 2;
        for (let i = 0; i < numPins; i++) {
            let angle = (i * 2 * Math.PI) / numPins;
            pins.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
        }

        let sequence = [0];
        let currentPin = 0;
        let pinUsage = new Int32Array(numPins);
        let recencyBuffer = [];
        const minPinDist = Math.max(10, Math.floor(numPins / 20));
        const recencySize = Math.max(5, Math.floor(numPins / 15));

        function ipart(x) { return Math.floor(x); }
        function round(x) { return ipart(x + 0.5); }
        function fpart(x) { return x - Math.floor(x); }
        function rfpart(x) { return 1 - fpart(x); }

        function processWuLine(x0, y0, x1, y1, isSubtract, lineWeight) {
            let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
            if (steep) { let t = x0; x0 = y0; y0 = t; t = x1; x1 = y1; y1 = t; }
            if (x0 > x1) { let t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }

            let dx = x1 - x0;
            let dy = y1 - y0;
            let gradient = dx === 0.0 ? 1.0 : dy / dx;

            let xend = round(x0);
            let yend = y0 + gradient * (xend - x0);
            let xgap = rfpart(x0 + 0.5);
            let xpxl1 = xend;
            let ypxl1 = ipart(yend);
            
            let accum = { sum: 0, count: 0 };
            
            function plot(x, y, c) {
                let px = steep ? y : x;
                let py = steep ? x : y;
                if (px >= 0 && px < size && py >= 0 && py < size) {
                    let idx = py * size + px;
                    if (isSubtract) {
                        workingData[idx] = Math.max(0, workingData[idx] - (lineWeight * c));
                    } else {
                        const nx = (px - (size / 2)) / (size / 2);
                        const ny = (py - (size / 2)) / (size / 2);
                        const ellipse = (nx * nx) / (0.34 * 0.34) + (ny * ny) / (0.44 * 0.44);
                        let spatial = 1.0;
                        if (portraitMode === 'face') spatial = ellipse <= 1 ? 1.85 : 0.58;
                        else if (portraitMode === 'hybrid') spatial = ellipse <= 1 ? 1.38 : 0.84;
                        accum.sum += workingData[idx] * c * spatial;
                        accum.count += c * spatial;
                    }
                }
            }

            plot(xpxl1, ypxl1, rfpart(yend) * xgap);
            plot(xpxl1, ypxl1 + 1, fpart(yend) * xgap);
            let intery = yend + gradient;

            xend = round(x1);
            yend = y1 + gradient * (xend - x1);
            xgap = fpart(x1 + 0.5);
            let xpxl2 = xend;
            let ypxl2 = ipart(yend);

            plot(xpxl2, ypxl2, rfpart(yend) * xgap);
            plot(xpxl2, ypxl2 + 1, fpart(yend) * xgap);

            for (let x = xpxl1 + 1; x < xpxl2; x++) {
                plot(x, ipart(intery), rfpart(intery));
                plot(x, ipart(intery) + 1, fpart(intery));
                intery = intery + gradient;
            }

            return accum.count === 0 ? 0 : (accum.sum / accum.count);
        }

        for (let line = 0; line < numLines; line++) {
            let bestPin = -1, bestScore = -Infinity, p0 = pins[currentPin];
            for (let p = 0; p < numPins; p++) {
                if (recencyBuffer.includes(p)) continue;
                let dist = Math.abs(currentPin - p);
                if (dist > numPins / 2) dist = numPins - dist;
                if (dist < minPinDist) continue;
                
                const rawScore = processWuLine(p0.x, p0.y, pins[p].x, pins[p].y, false, 0);
                const penalty = penaltyAlpha * (pinUsage[currentPin] + pinUsage[p]);
                const score = rawScore - penalty;
                if (score > bestScore) { bestScore = score; bestPin = p; }
            }

            if (bestPin === -1) break;
            processWuLine(p0.x, p0.y, pins[bestPin].x, pins[bestPin].y, true, weight);
            sequence.push(bestPin);
            pinUsage[currentPin]++; pinUsage[bestPin]++;
            recencyBuffer.push(bestPin);
            if (recencyBuffer.length > recencySize) recencyBuffer.shift();
            currentPin = bestPin;
        }

        let coordinatesText = "MONOCHROME Thread Instructions (Nilavinnool Pro):\n";
        coordinatesText += `Total Pins: ${numPins} | Total Segments: ${sequence.length - 1}\n\n`;
        sequence.forEach((pin, idx) => {
            if (idx === 0) coordinatesText += `Start: PEG_${pin}\n`;
            else coordinatesText += `  - Step ${idx}: Go to PEG_${pin}\n`;
        });

        // Nodemailer Setup (Gmail Integration)
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'nilavinnool@gmail.com',         // உன்னோட பிசினஸ் ஜிமெயில்
                pass: 'YOUR_GMAIL_APP_PASSWORD'        // உன்னோட ஜிமெயில் App Password
            }
        });

        let mailOptions = {
            from: 'nilavinnool@gmail.com',
            to: customerEmail,
            subject: 'Your Nilavinnool String Art Pattern & Coordinates! 🌙',
            text: `Hi ${customerName || 'Customer'},\n\nYour string art coordinate file has been generated successfully and is attached with this email.\n\nThank you for choosing Nilavinnool!`,
            attachments: [
                {
                    filename: 'nilavinnool_coordinates.test.txt',
                    content: coordinatesText
                }
            ]
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ 
            success: true, 
            message: 'String art generated and emailed successfully!',
            sequence: sequence
        });

    } catch (error) {
        console.error('Backend Processing Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Nilavinnool Backend running on port ${PORT}`);
});