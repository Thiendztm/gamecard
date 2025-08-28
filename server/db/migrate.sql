-- ==========================================================
-- Schema cho game card - User Authentication
-- Sử dụng MySQL 8+, InnoDB, utf8mb4 để hỗ trợ emoji/ký tự đặc biệt
-- ==========================================================
-- Bảng người dùng chính thức
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(191) NOT NULL,
    username VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- Bảng pending cho quy trình verify email
CREATE TABLE IF NOT EXISTS pending_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(191) NOT NULL,
    username VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    verify_code VARCHAR(6) NOT NULL,
    expire_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pending_email (email),
    UNIQUE KEY uq_pending_username (username),
    KEY idx_email_code (email, verify_code),
    KEY idx_expire (expire_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;