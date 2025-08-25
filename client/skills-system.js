// Skills System for Combat
class SkillsSystem {
    constructor() {
        this.skillsPanel = null;
        this.isVisible = false;
        this.skills = [];
        this.initAsync();
    }

    async initAsync() {
        await this.init();
    }

    async init() {
        console.log('Initializing skills system...');
        await this.loadCharacterSkills();
        this.createSkillsPanel();
        this.bindEvents();
        console.log('Skills system initialized');
    }

    async loadCharacterSkills() {
        // Get selected character from sessionStorage
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const selectedCharacter = roomCharacterSelections[user.username];
        
        if (!selectedCharacter) {
            console.log('No character selected, loading default skills');
            this.skills = [
                { id: 1, name: 'Chọn nhân vật trước' }
            ];
            return;
        }

        try {
            const skillFile = selectedCharacter === 'marisa' ? 'marisaSkill.txt' : 'reimuSkill.txt';
            const response = await fetch(`/${skillFile}`);
            const skillText = await response.text();
            
            // Parse skills from text file - each line is a skill
            const skillLines = skillText.split('\n').filter(line => line.trim());
            this.skills = skillLines.map((skill, index) => ({
                id: index + 1,
                name: skill.trim()
            }));
            
            console.log(`Loaded ${this.skills.length} skills for ${selectedCharacter}:`, this.skills);
        } catch (error) {
            console.error('Failed to load character skills:', error);
            this.skills = [
                { id: 1, name: 'Lỗi tải kỹ năng' }
            ];
        }
    }

    createSkillsPanel() {
        console.log('Creating skills panel with skills:', this.skills);
        
        // Get selected character for sprite display
        const roomCharacterSelections = JSON.parse(sessionStorage.getItem('roomCharacterSelections') || '{}');
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        const selectedCharacter = roomCharacterSelections[user.username] || 'reimu';
        
        // Create skills panel with only skills board
        const skillsHTML = `
            <div class="skills-panel" id="skillsPanel">
                <div class="skills-board">
                    ${this.skills.map(skill => `
                        <div class="skill-item" data-skill-id="${skill.id}" data-skill-name="${skill.name}" title="Hover để xem mô tả">
                            <div class="skill-name">${skill.name}</div>
                            <div class="skill-tooltip" id="tooltip-${skill.id}">Đang tải mô tả...</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Add to action panel instead of body
        const actionPanel = document.querySelector('.action-panel');
        if (actionPanel) {
            actionPanel.insertAdjacentHTML('beforeend', skillsHTML);
            this.skillsPanel = document.getElementById('skillsPanel');
        } else {
            console.error('Action panel not found!');
        }
        console.log('Skills panel created:', !!this.skillsPanel);
        
        // Load skill descriptions for tooltips
        this.loadSkillDescriptions();
    }

    async loadSkillDescriptions() {
        for (const skill of this.skills) {
            try {
                // Map skill names to actual file names
                let fileName = skill.name;
                if (skill.name === 'Spirit Sign "Dream Seal"') {
                    fileName = 'Spirit Sign Dream Seal';
                } else if (skill.name === 'Love Sign "Master Spark"') {
                    fileName = 'Love Sign Master Spark';
                }
                
                console.log(`Loading skill description for: ${skill.name} -> ${fileName}`);
                const response = await fetch(`/skill/${encodeURIComponent(fileName)}.txt`);
                console.log(`Response status for ${fileName}: ${response.status}`);
                
                if (response.ok) {
                    const description = await response.text();
                    console.log(`Description loaded for ${fileName}:`, description);
                    const lines = description.split('\n').filter(line => line.trim());
                    
                    // Format skill description with proper line breaks
                    let formattedDescription = '';
                    if (lines.length > 1) {
                        // Skip first line (skill name) and format the rest
                        const descLines = lines.slice(1);
                        formattedDescription = descLines.join('\n');
                    } else {
                        formattedDescription = 'Không có mô tả chi tiết';
                    }
                    
                    const tooltip = document.getElementById(`tooltip-${skill.id}`);
                    if (tooltip) {
                        tooltip.textContent = formattedDescription;
                        // Add skill name as title
                        tooltip.setAttribute('data-skill-name', skill.name);
                    }
                } else {
                    console.error(`Failed to load ${fileName}: ${response.status} ${response.statusText}`);
                    const tooltip = document.getElementById(`tooltip-${skill.id}`);
                    if (tooltip) {
                        tooltip.textContent = `Không tìm thấy file: ${fileName}`;
                    }
                }
            } catch (error) {
                console.error(`Failed to load description for ${skill.name}:`, error);
                const tooltip = document.getElementById(`tooltip-${skill.id}`);
                if (tooltip) {
                    tooltip.textContent = 'Lỗi tải mô tả';
                }
            }
        }
    }

    bindEvents() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupEventListeners();
            });
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        // Bind to Kỹ năng button
        document.addEventListener('click', (event) => {
            if (event.target && event.target.textContent === 'Kỹ năng') {
                console.log('Kỹ năng button clicked!');
                event.preventDefault();
                this.showSkillsPanel();
            }
        });

        // Close panel when clicking close button
        document.addEventListener('click', (event) => {
            if (event.target && event.target.id === 'skillsClose') {
                this.hideSkillsPanel();
            }
        });

        // Close panel when clicking outside
        document.addEventListener('click', (event) => {
            if (this.isVisible && this.skillsPanel && event.target && 
                !this.skillsPanel.contains(event.target) && 
                event.target.textContent !== 'Kỹ năng') {
                this.hideSkillsPanel();
            }
        });

        // Handle skill selection with event delegation
        document.addEventListener('click', (event) => {
            // Check if clicked element or its parent is a skill item
            let target = event.target;
            while (target && target !== document) {
                if (target.classList && target.classList.contains('skill-item')) {
                    console.log('Skill item clicked!', target);
                    const skillId = target.dataset.skillId;
                    console.log('Skill ID:', skillId);
                    const skill = this.skills.find(s => s.id == skillId);
                    console.log('Found skill:', skill);
                    if (skill) {
                        this.selectSkill(skill);
                    }
                    return;
                }
                target = target.parentElement;
            }
        });

        // Enhanced tooltip interactions
        document.addEventListener('mouseenter', (event) => {
            if (event.target && event.target.classList && event.target.classList.contains('skill-item')) {
                const tooltip = event.target.querySelector('.skill-tooltip');
                if (tooltip) {
                    // Add slight delay for better UX
                    setTimeout(() => {
                        if (event.target && event.target.matches && event.target.matches(':hover')) {
                            tooltip.style.opacity = '1';
                            tooltip.style.visibility = 'visible';
                        }
                    }, 200);
                }
            }
        }, true);

        document.addEventListener('mouseleave', (event) => {
            if (event.target && event.target.classList && event.target.classList.contains('skill-item')) {
                const tooltip = event.target.querySelector('.skill-tooltip');
                if (tooltip) {
                    tooltip.style.opacity = '0';
                    tooltip.style.visibility = 'hidden';
                }
            }
        }, true);
    }

    showSkillsPanel() {
        console.log('Showing skills panel:', !!this.skillsPanel);
        if (this.skillsPanel) {
            this.skillsPanel.classList.add('visible');
            this.isVisible = true;
            console.log('Skills panel is now visible');
        } else {
            console.error('Skills panel not found when trying to show!');
        }
    }

    hideSkillsPanel() {
        this.skillsPanel.classList.remove('visible');
        this.isVisible = false;
    }

    selectSkill(skill) {
        if (skill) {
            console.log(`Selected skill: ${skill.name}`);
            console.log('Combat system available:', !!window.combatSystem);
            console.log('Combat system object:', window.combatSystem);
            
            // Trigger combat action with skill
            if (window.combatSystem) {
                console.log('Calling combat system selectAction with skill:', skill);
                window.combatSystem.selectAction('skill', skill);
            } else {
                console.error('Combat system not available!');
            }
            
            // Hide panel after selection
            this.hideSkillsPanel();
        }
    }

    getSkillById(skillId) {
        return this.skills.find(s => s.id === skillId);
    }
}

// Initialize skills system
const skillsSystem = new SkillsSystem();

// Make globally available
window.skillsSystem = skillsSystem;
