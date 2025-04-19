import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// تنظیم مسیر ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const port = process.env.PORT || 3000;

// تنظیمات امنیتی
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// ایجاد پوشه uploads در مسیر موقت سیستم
const uploadsDir = process.env.UPLOADS_DIR || join(os.tmpdir(), 'video-compressor-uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// تنظیمات ذخیره‌سازی فایل
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // محدودیت حجم فایل: 100MB
    }
});

// تنظیم CORS برای دامنه‌های مجاز
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // کش کردن preflight requests برای 24 ساعت
}));

// اضافه کردن middleware برای OPTIONS
app.options('*', cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static('static', {
    maxAge: '1h',
    etag: true
}));

// مسیر اصلی
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'static', 'index.html'));
});

// مسیر فشرده‌سازی ویدیو
app.post('/compress', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
}, upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'هیچ فایلی آپلود نشده است' });
    }

    const inputPath = req.file.path;
    const outputPath = join(uploadsDir, 'compressed-' + req.file.filename);
    const quality = req.body.quality || 'medium';

    // تنظیمات فشرده‌سازی بر اساس کیفیت
    const compressionSettings = {
        low: { crf: 28, preset: 'ultrafast' },
        medium: { crf: 23, preset: 'medium' },
        high: { crf: 18, preset: 'slow' }
    };

    const settings = compressionSettings[quality];

    ffmpeg(inputPath)
        .outputOptions([
            `-c:v libx264`,
            `-crf ${settings.crf}`,
            `-preset ${settings.preset}`,
            '-c:a aac',
            '-b:a 128k'
        ])
        .output(outputPath)
        .on('end', () => {
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', 'attachment; filename=compressed-video.mp4');
            res.download(outputPath, 'compressed-video.mp4', (err) => {
                if (err) {
                    console.error('خطا در ارسال فایل:', err);
                }
                cleanupFiles([inputPath, outputPath]);
            });
        })
        .on('error', (err) => {
            console.error('خطا در فشرده‌سازی:', err);
            cleanupFiles([inputPath, outputPath]);
            res.status(500).json({ error: 'خطا در فشرده‌سازی ویدیو' });
        })
        .run();
});

// تابع کمکی برای پاکسازی فایل‌ها
function cleanupFiles(files) {
    files.forEach(file => {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (err) {
            console.error(`خطا در پاکسازی فایل ${file}:`, err);
        }
    });
}

// مسیر وضعیت سرور
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// تنظیمات سرور
const server = app.listen(port, () => {
    console.log(`سرور در پورت ${port} در حال اجراست`);
    console.log(`پوشه آپلود: ${uploadsDir}`);
});

// تنظیمات timeout
server.timeout = 300000; // 5 دقیقه
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000; 