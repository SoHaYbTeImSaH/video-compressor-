import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// تنظیم مسیر ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const port = process.env.PORT || 3000;

// ایجاد پوشه uploads اگر وجود نداشته باشد
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
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

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.static('static'));

// مسیر اصلی
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'static', 'index.html'));
});

// مسیر فشرده‌سازی ویدیو
app.post('/compress', upload.single('video'), (req, res) => {
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
            // ارسال فایل فشرده شده
            res.download(outputPath, 'compressed-video.mp4', (err) => {
                if (err) {
                    console.error('خطا در ارسال فایل:', err);
                }
                // پاکسازی فایل‌ها
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);
            });
        })
        .on('error', (err) => {
            console.error('خطا در فشرده‌سازی:', err);
            // پاکسازی فایل در صورت خطا
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            res.status(500).json({ error: 'خطا در فشرده‌سازی ویدیو' });
        })
        .run();
});

app.listen(port, () => {
    console.log(`سرور در پورت ${port} در حال اجراست`);
}); 