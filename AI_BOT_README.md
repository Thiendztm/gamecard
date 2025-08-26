# Hệ thống AI Bot cho Touhou Card Game

## Tổng quan

Hệ thống AI Bot cho phép người chơi đấu với máy tính thay vì phải chờ đối thủ thực. AI được thiết kế với nhiều mức độ khó khác nhau để phù hợp với trình độ của người chơi.

## Tính năng chính

### 1. Nhiều mức độ khó

- **Dễ**: AI chơi ngẫu nhiên với một số logic cơ bản, thích hợp cho người mới bắt đầu
- **Trung bình**: AI có chiến thuật cơ bản, ưu tiên heal khi HP thấp và tấn công khi đối thủ yếu
- **Khó**: AI có chiến thuật nâng cao, tính toán điểm số cho mỗi lượt đi
- **Chuyên gia**: AI chơi tối ưu, tính toán tất cả kịch bản có thể và chọn nước đi tốt nhất

### 2. Tính cách AI đa dạng

Mỗi AI bot có các đặc điểm tính cách khác nhau:

- **Aggressiveness**: Mức độ hung hăng trong tấn công
- **Defensiveness**: Khuynh hướng phòng thủ
- **Healing Tendency**: Xu hướng sử dụng heal

### 3. Thích ứng với nhân vật

AI điều chỉnh chiến thuật dựa trên nhân vật được chọn:

- **Witch**: Thiên về tấn công, ưu tiên sử dụng skill đặc biệt với attack
- **Miko**: Cân bằng với khuynh hướng heal, skill đặc biệt với heal
- **Sakuya**: Phòng thủ mạnh, skill đặc biệt với defend

### 4. Độ khó thích ứng

Hệ thống có thể tự động điều chỉnh độ khó dựa trên thành tích của người chơi:

- Tỷ lệ thắng < 30%: Chuyển về độ khó Dễ
- Tỷ lệ thắng 30-50%: Độ khó Trung bình
- Tỷ lệ thắng 50-70%: Độ khó Khó
- Tỷ lệ thắng > 70%: Độ khó Chuyên gia

## Cấu trúc code

### Files chính

- `bot.js`: Chứa logic AI chính
  - `AIBot`: Class đại diện cho một AI bot
  - `AIBotManager`: Quản lý nhiều AI bots
- `index.js`: Server integration, xử lý AI rooms
- `main_menu.js`: Client-side logic cho việc tạo phòng AI

### AI Decision Making Process

1. **Phân tích trạng thái game**: HP, shield, turn, hand cards
2. **Tính toán điểm số**: Mỗi lá bài được đánh giá dựa trên tình hình hiện tại
3. **Dự đoán đối thủ**: AI cố gắng dự đoán nước đi của đối thủ
4. **Chọn nước đi tối ưu**: Dựa trên tổng hợp các yếu tố trên

### Ví dụ về logic AI (Medium difficulty)

```javascript
// Ưu tiên heal khi HP thấp
if (this.hp <= 40 && this.hand.includes("heal")) {
  return this.hand.indexOf("heal");
}

// Tấn công khi đối thủ yếu
if (opponentHp <= 40 && this.hand.includes("attack")) {
  return this.hand.indexOf("attack");
}

// Phòng thủ khi cần shield
if (this.shield <= 15 && this.hand.includes("defend")) {
  return this.hand.indexOf("defend");
}
```

## Cách sử dụng

### Tạo phòng AI

1. Vào menu chính, chọn "Tạo phòng"
2. Chọn "Đánh với máy"
3. Chọn độ khó AI mong muốn
4. Tạo phòng và bắt đầu chơi

### Tùy chỉnh AI (cho developers)

```javascript
// Tạo AI bot với tùy chỉnh
const aiBot = new AIBot("Custom Bot", "Witch", "hard");
aiBot.aggressiveness = 0.8; // Rất hung hăng
aiBot.defensiveness = 0.2; // Ít phòng thủ
aiBot.healingTendency = 0.3; // Ít heal
```

## Performance và tối ưu

### Memory Management

- AI bots được tự động dọn dẹp sau 1 giờ không hoạt động
- History được giới hạn ở 10 turns gần nhất để tiết kiệm memory

### Thinking Time

AI có thời gian "suy nghĩ" khác nhau theo độ khó:

- Dễ: 0.5-1.5 giây
- Trung bình: 1-2.5 giây
- Khó: 1.5-3.5 giây
- Chuyên gia: 2-4.5 giây

### API Endpoints

- `GET /api/ai-difficulties`: Lấy danh sách độ khó
- `POST /api/create-ai-opponent`: Tạo AI opponent tùy chỉnh

## Future Improvements

1. **Machine Learning**: Huấn luyện AI từ dữ liệu trận đấu thực
2. **Personality Profiles**: Thêm nhiều kiểu tính cách AI đa dạng
3. **Dynamic Difficulty**: Điều chỉnh độ khó trong game
4. **AI vs AI**: Cho phép AI đấu với nhau để test
5. **Advanced Analytics**: Phân tích deep gameplay patterns

## Troubleshooting

### AI không hoạt động

- Kiểm tra file `rules.json` có tồn tại không
- Đảm bảo `bot.js` được import đúng cách trong `index.js`

### AI chơi quá dễ/khó

- Điều chỉnh độ khó trong menu tạo phòng
- Hoặc sử dụng adaptive difficulty

### Performance issues

- Giảm số lượng AI bots đồng thời
- Tăng interval cleanup (hiện tại: 1 giờ)

## Credits

Hệ thống AI Bot được phát triển để nâng cao trải nghiệm người chơi Touhou Card Game, cho phép practice và giải trí mà không cần đối thủ thực.
