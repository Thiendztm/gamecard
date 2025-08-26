class SkillManager {
    constructor() {
        this.skills = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing skill manager...');
        await this.loadAllSkills();
        this.initialized = true;
        console.log('Skill manager initialized with', this.skills.size, 'skills');
    }

    async loadAllSkills() {
        const skillFiles = [
            'Dimensional Rift.txt',
            'Hakurei Amulet.txt', 
            'Heal.txt',
            'Illusion Laser.txt',
            'Love Sign Master Spark.txt',
            'Magic Missile.txt',
            'Spirit Sign Dream Seal.txt',
            'Witch Leyline.txt',
            'Youkai Buster.txt'
        ];

        for (const filename of skillFiles) {
            try {
                const response = await fetch(`/skill/${filename}`);
                if (response.ok) {
                    const content = await response.text();
                    const skill = this.parseSkillFile(content, filename);
                    if (skill) {
                        this.skills.set(skill.id, skill);
                        console.log('Loaded skill:', skill.name);
                    }
                }
            } catch (error) {
                console.error(`Failed to load skill ${filename}:`, error);
            }
        }
    }

    parseSkillFile(content, filename) {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 3) return null;

        const name = lines[0];
        const description = lines[1];
        const mpCost = lines[2];

        // Parse damage from description
        let damage = 0;
        let heal = 0;
        let special = null;

        // Extract damage
        const damageMatch = description.match(/Gây (\d+) sát thương/);
        if (damageMatch) {
            damage = parseInt(damageMatch[1]);
        }

        // Extract heal
        const healMatch = description.match(/hồi (\d+) (?:HP|máu)/);
        if (healMatch) {
            heal = parseInt(healMatch[1]);
        }

        // Extract MP cost
        let mpRequired = 0;
        const mpMatch = mpCost.match(/Tốn (\d+) MP/);
        if (mpMatch) {
            mpRequired = parseInt(mpMatch[1]);
        }

        // Special effects
        if (description.includes('< 50 hp tất sát')) {
            special = 'execute_low_hp';
        } else if (description.includes('Cường hóa đòn đánh')) {
            special = 'enhance_attack';
        }

        return {
            id: filename.replace('.txt', '').toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: name,
            description: description,
            damage: damage,
            heal: heal,
            mpCost: mpRequired,
            special: special,
            filename: filename
        };
    }

    getSkill(skillId) {
        return this.skills.get(skillId);
    }

    getAllSkills() {
        return Array.from(this.skills.values());
    }

    getSkillsByCharacter(character) {
        // For now, return all skills. Later can be filtered by character
        return this.getAllSkills();
    }

    // Calculate actual damage/effects based on game state
    calculateSkillEffects(skill, casterHP, targetHP) {
        let actualDamage = skill.damage;
        let actualHeal = skill.heal;

        // Special effect: Execute if target < 50 HP
        if (skill.special === 'execute_low_hp' && targetHP < 50) {
            actualDamage = targetHP; // Instant kill
        }

        return {
            damage: actualDamage,
            heal: actualHeal,
            mpCost: skill.mpCost,
            special: skill.special
        };
    }

    // Get random skill for AI opponent
    getRandomSkill(availableMP) {
        const availableSkills = this.getAllSkills().filter(skill => skill.mpCost <= availableMP);
        if (availableSkills.length === 0) return null;
        
        return availableSkills[Math.floor(Math.random() * availableSkills.length)];
    }
}

// Global skill manager instance
window.skillManager = new SkillManager();

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.skillManager) {
            window.skillManager.initialize();
        }
    }, 1000);
});
