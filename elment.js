const fs = require('fs');
const path = require('path');

// Core framework object
const _ = {};

// Global data and logic storage (shared across all requests)
_.D$ = {};  // Global data (shared across all requests)
_.M$ = {};  // Global logic (shared across all requests)
// Global storage for registered components
_.$ = {};

// Error logger function
const logError = (message, level = 'error', context = '') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Log context if provided
    if (context) {
        console.log(`${logMessage}`)
    } else {
        console.log(logMessage);
    }
};

// Register a component globally, ensuring it has a render method
_.register = (name, component) => {
    if (component && typeof component.render === 'function') {
        _.$[name] = component;
    } else {
        logError(`Failed to register component: ${name} (Invalid or missing render function)`, 'error');
    }
};

// Auto-load components from `/components/`
_.autoloadComponents = (folder) => {
    const componentsPath = path.join(__dirname, folder);

    if (!fs.existsSync(componentsPath)) {
        logError('Components directory not found.', 'error', `Folder: ${componentsPath}`);
        return;
    }

    fs.readdirSync(componentsPath).forEach(file => {
        if (file.endsWith('.js')) {
            _.require().file(`${folder}/${file}`);
        }
    });
};

// Dynamically require a component and register it if missing
_.require = () => ({
    file: (filePath) => {
        const absolutePath = path.resolve(__dirname, filePath);
        if (!fs.existsSync(absolutePath)) {
            logError(`Component file not found: ${filePath}`, 'error');
            return null;
        }

        try {
            const component = require(absolutePath);
            const name = path.basename(filePath, '.js'); // Extract component name
            _.register(name, component); // Register it globally
            return component;
        } catch (error) {
            logError(`Error loading component ${filePath}: ${error.message}`, 'error');
            return null;
        }
    }
});

// Render a component dynamically
_.renderComponent = (componentName, context = {}, depth = 0) => {
    if (!_.$[componentName]) {
        // Try to load the component if it’s not registered
        const loadedComponent = _.require().file(`${componentName}.js`);
        console.log(componentName, loadedComponent)
        if (loadedComponent) {
            _.register(componentName, loadedComponent);
        }
    }

    // If component is still not found, return the raw component object (instead of rendering)
    if (!_.$[componentName] || typeof _.$[componentName].render !== 'function') {
        logError(`Component "${componentName}" is missing or does not have a valid render() function.`, 'error');
        return _.$[componentName] || {}; // Return the component object instead of breaking
    }

    // Prevent infinite recursion
    if (depth > 50) {
        logError(`Infinite recursion detected in component: ${componentName}`, 'error');
        return '';
    }

    // If no context or child exists, return the raw component object
    if (!context || typeof context !== 'object') {
        return _.$[componentName];
    }

    // Render component and pass the child renderer function only if needed
    return _.$[componentName].render(context, (childName) => {
        if (!childName || !_.$[childName]) return _.$[childName] || {}; // Return object if child is missing
        return _.renderComponent(childName, context, depth + 1);
    });
};

// Build the full HTML document
_.render = (context) => {
    return _.el('html', 'lang="en"', [
        _.el('head', '', [
            context.header
        ]),
        _.el('body', '', [
            context.content
        ])
    ]);
};

// Helper function to generate HTML elements with error handling
_.el = (tag, attributes = '', children = [], events = {}) => {
    try {
        // Check if tag is a string
        if (typeof tag !== 'string') {
            console.error(`Tag must be a string. Given: ${tag}`);
            return '';
        }

        // Ensure attributes is a string
        if (typeof attributes !== 'string') {
            if (Array.isArray(attributes)) {
                children = attributes; // Swap values if attributes is an array
                attributes = '';
            } else {
                console.error(`Attributes must be a string. Given: ${attributes}`);
                attributes = '';
            }
        }

        // Ensure children is an array
        if (!Array.isArray(children)) {
            children = [children];
        }

        // Process children: if any element is a function (el call), evaluate it
        children = children.map(child => {
            if (typeof child === 'function') {
                return child();  // Call function if it's a function
            } else if (Array.isArray(child)) {
                return _.elment(child); // Recursively process nested children
            }
            return child;  // If it's a plain string, return it
        }).join('');

        let eventAttributes = events && typeof events === 'object'
            ? Object.keys(events)
                .map(eventType => {
                    let eventHandler = events[eventType];

                    // Ensure proper formatting of function calls inside attributes
                    let eventCall = Array.isArray(eventHandler)
                        ? eventHandler.map(fn => fn.replace(/"/g, `'`)).join(';') // Replace " with '
                        : eventHandler.replace(/"/g, `'`);

                    return `on${eventType}="${eventCall}"`;
                })
                .join(' ')
            : '';

        // Combine attributes and event attributes, removing empty strings
        const allAttributes = [attributes, eventAttributes]
            .map(attr => attr.trim())  // Trim any extra spaces
            .filter(attr => attr !== '') // Filter out empty attributes
            .join(' ');
        

        // Self-closing tags handling
        const selfClosingTags = ['img', 'input', 'br', 'meta', 'link', 'hr'];
        if (selfClosingTags.includes(tag.toLowerCase())) {
            return `<${tag} ${allAttributes} />`; // Self-closing tag
        }

        return `<${tag} ${allAttributes}>${children}</${tag}>`;

    } catch (error) {
        console.error(`Error in _.el(): ${error.message}`);
        return `<${tag}></${tag}>`;  // Return fallback tag
    }
};



// Generate shorthand methods for common HTML elements
const elements = [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'a', 'img', 'button', 'input', 'form', 'label', 'section', 'article', 'header',
    'footer', 'nav', 'aside', 'main', 'strong', 'em', 'b', 'i', 'table', 'tr', 'td', 'th', 'script',
    'body', 'html', 'meta', 'title', 'link', 'head', 'br', 'main', 'small', 'hr', 'pre', 'code'
];

_.createEl = (tags) => {
    tags.forEach(tag => {
        _[tag] = (attributes = '', children = [], events = {}) => {
            // If children is not an array, treat it as plain content and make it an array
            if (!Array.isArray(children)) {
                children = [children];
            }
            return _.el(tag, attributes, children, events);
        };
    });
}

_.addEl = (els) => {
    els.forEach(el => {
        _[el.tag] = (attributes = '', children = [], events = {}) => {
            // If children is not an array, treat it as plain content and make it an array
            if (!Array.isArray(children)) {
                children = [children];
            }
            return _.el(tag, el.attr, el.children, el.events);
        };
    });
}

_.createEl(elements)

// Component rendering - Render an array of elements
_.elment = (elements) => {
    return elements.map((element) => {
        // Process each element for dynamic content
        if (typeof element === 'function') {
            return element(); // Call function to generate dynamic content
        }
        return element;
    }).join('');
};

// Helper function for adding global data
_.helpers = (helperName, helperFunction) => {
    _.h[helperName] = helperFunction;
};

// In framework.js or helpers.js
_.if = (condition, trueValue, falseValue = '') => {
    return condition ? trueValue : falseValue;
};

_.switch = (condition, cases) => {
    if (cases[condition]) {
        return cases[condition];
    } else {
        if (!cases['default']) {
            logError(`Switch case for "${condition}" not found and no default case provided.`, 'warning');
        }
        return cases['default'] || '';
    }
};  

_.where = (data, condition) => {
    if (typeof condition === 'function') {
        // If condition is a function, apply the function to filter
        return data.filter(condition);
    } else if (typeof condition === 'object') {
        // If condition is an object, check for key-value matches
        return data.filter(item => {
            return Object.keys(condition).every(key => item[key] === condition[key]);
        });
    } else {
        return [];
    }
};

_.for = (data, callback, end) => {
    if (Array.isArray(data)) {
        return data.map((item, index) => callback(item, index)).join('');
    } 
    
    if (typeof data === 'object') {
        let index = 0;
        return Object.keys(data).map(key => callback(data[key], key, index++));
    } 
    
    if (typeof data === 'number' && typeof end === 'number') {
        return Array.from({ length: end - data }, (_, index) => callback(data + index, index));
    }

    if (typeof data === 'string') {
        return data
    }

    if (data === _.$) {
        return Object.keys(_.$).map((key, index) => callback(_.$[key], key, index));
    }

    return [];
};

// Export the framework
module.exports = _
