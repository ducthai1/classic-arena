import fs from 'fs';
import path from 'path';

// Regex chỉ chấp nhận chữ cái tiếng Việt và khoảng trắng
const ALPHABET_REGEX = /^[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+$/;

async function scanInvalidWords() {
    const inputPath = path.join(__dirname, 'vietnamese-wordlist.txt');
    const outputPath = path.join(__dirname, 'invalid_words_report.txt');

    console.log(`📖 Đang đọc file từ điển: ${inputPath}...`);
    
    try {
        const content = fs.readFileSync(inputPath, 'utf-8');
        const lines = content.split('\n');
        
        const invalidWords: string[] = [];
        const warnings: string[] = [];
        let emptyLines = 0;

        lines.forEach((line, index) => {
            // Check dòng trống hoàn toàn
            if (line.length === 0) {
                emptyLines++;
                return;
            }

            const word = line.trim();
            const originalLine = line;

            // 1. Check dòng chỉ chứa khoảng trắng
            if (!word && line.length > 0) {
                emptyLines++;
                return;
            }

            // 2. Check khoảng trắng thừa (đầu/cuối hoặc kép)
            // Logic: Nếu sau khi trim mà khác gốc -> thừa đầu cuối
            // Hoặc nếu có 2 dấu cách liền nhau
            if (line !== word || /\s{2,}/.test(word)) {
                warnings.push(`Dòng ${index + 1}: Lỗi khoảng trắng -> "${originalLine}"`);
            }

            // 3. Check ký tự lạ (Số, dấu câu, ký tự đặc biệt)
            if (!ALPHABET_REGEX.test(word)) {
                invalidWords.push(`Dòng ${index + 1} (Ký tự lạ): "${word}"`);
                return; // Nếu lỗi này thì bỏ qua check tiếp
            }

            // 4. Check độ dài (Quá ngắn)
            // Từ 1 ký tự mà không phải nguyên âm cơ bản thì báo nghi vấn
            if (word.length === 1 && !['u', 'y', 'a', 'o', 'e', 'ê', 'i', 'ư', 'ơ', 'ô'].includes(word.toLowerCase())) {
                 invalidWords.push(`Dòng ${index + 1} (Quá ngắn/Hiếm): "${word}"`);
            }
            
            // 5. Check viết hoa (nếu từ điển chuẩn nên là lowercase)
            if (word !== word.toLowerCase()) {
                warnings.push(`Dòng ${index + 1} (Viết hoa): "${word}"`);
            }
        });

        // Ghi báo cáo report
        const reportContent = [
            `--- BÁO CÁO QUÉT LỖI TỪ ĐIỂN ---`,
            `Thời gian quét: ${new Date().toLocaleString()}`,
            `Tổng số dòng: ${lines.length}`,
            `Số dòng trống: ${emptyLines}`,
            ``,
            `=== 1. TỪ CHỨA KÝ TỰ LẠ / NGHI VẤN LỖI (${invalidWords.length}) ===`,
            `(Bao gồm: số, ký tự đặc biệt, từ đơn lạ)`,
            ...invalidWords,
            ``,
            `=== 2. CẢNH BÁO ĐỊNH DẠNG (${warnings.length}) ===`,
            `(Bao gồm: thừa khoảng trắng, viết hoa)`,
            ...warnings
        ].join('\n');

        fs.writeFileSync(outputPath, reportContent, 'utf-8');

        console.log(`✅ Đã quét xong!`);
        console.log(`- Phát hiện ${invalidWords.length} từ lỗi nghiêm trọng.`);
        console.log(`- Phát hiện ${warnings.length} cảnh báo định dạng.`);
        console.log(`📄 Xem chi tiết tại: ${outputPath}`);

    } catch (error) {
        console.error('❌ Lỗi khi đọc file:', error);
    }
}

scanInvalidWords();
