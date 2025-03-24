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
        console.log('path => ', absolutePath)
        if (!fs.existsSync(absolutePath)) {
            logError(`Component file not found: ${filePath}`, 'error');
            return null;
        }

        try {
            const component = require(absolutePath);
            console.log('component', component)
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
_.el = (tag, attributes = '', children = []) => {
    try {
        type = 1
        // Check if tag is a string
        if (typeof tag !== 'string') {
            logError('Tag must be a string.', 'error', `Tag: ${tag}`);
            return '';
        }

        // Check if attributes is a string, if not, set it to an empty string
        // and make children the array passed
        if (typeof attributes !== 'string') {
            logError('Attributes must be a string.', 'error', `Attributes: ${attributes}`);
            // if attributes is an array
            if (Array.isArray(attributes)) {
                children = attributes; // If not, convert it to an array
                attributes = '';
            }
        }

        // Ensure children is always an array
        if (!Array.isArray(children)) {
            children = [children]; // If not, convert it to an array
        } 

        // Process children: if any element is a function (el call), evaluate it
        children = children.map(child => {
            if (typeof child === 'function') {
                return child();  // Call function if it's a function
            } else if (Array.isArray(child)) {
                // Recursively process nested children arrays
                return _.elment(child);
            }
            return child;  // If it's a plain string, return it
        }).join('');  // Join children into a single string

        return `<${tag} ${attributes}>${children}</${tag}>`
        if (children === '') {
            return `<${tag} ${attributes} />`;
        } else {
            return `<${tag} ${attributes}>${children}</${tag}>`;
        }

    } catch (error) {
        logError(`Error occurred in _.el function: ${error.message}`, 'error', `Tag: ${tag}, Attributes: ${attributes}, Children: ${children}`);
        return '';  // Return an empty string if error occurs
    }
};


// Generate shorthand methods for common HTML elements
const elements = [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
    'a', 'img', 'button', 'input', 'form', 'label', 'section', 'article', 'header',
    'footer', 'nav', 'aside', 'main', 'strong', 'em', 'b', 'i', 'table', 'tr', 'td', 'th', 'script',
    'body', 'html', 'meta', 'title', 'link', 'head', 'br', 'main', 'small', 'hr', 'pre', 'code'
];

/*elements.forEach(tag => {
    _[tag] = (attributes = '', children = []) => {
        // If children is not an array, treat it as plain content and make it an array
        if (!Array.isArray(children)) {
            children = [children];
        }
        return _.el(tag, attributes, children);
    };
});*/

_.createEl = (tags) => {
    tags.forEach(tag => {
        _[tag] = (attributes = '', children = []) => {
            // If children is not an array, treat it as plain content and make it an array
            if (!Array.isArray(children)) {
                children = [children];
            }
            return _.el(tag, attributes, children);
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
    _.M$[helperName] = helperFunction;
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

_.for = (data, end, callback) => {
    if (Array.isArray(data)) {
        return data.map((item, index) => callback(item, index));
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


/*
component examples
_.switch()
// components/header.js
module.exports = {
    render: (context) => {
        const user = context.requestData.user;
        const isAuthenticated = context.requestData.isAuthenticated;

        // Create navigation items based on user role
        const navItems = _.switch(user.role, {
            admin: [
                _.el('li', '', _.el('a', 'href="/dashboard"', 'Dashboard')),
                _.el('li', '', _.el('a', 'href="/settings"', 'Settings'))
            ],
            user: [
                _.el('li', '', _.el('a', 'href="/profile"', 'Profile')),
                _.el('li', '', _.el('a', 'href="/logout"', 'Logout'))
            ],
            default: [
                _.el('li', '', _.el('a', 'href="/login"', 'Login')),
                _.el('li', '', _.el('a', 'href="/register"', 'Register'))
            ]
        });

        // Render header with dynamic navItems
        return _.el('header', 'class="site-header"', [
            _.el('h1', '', `Welcome to JL WebServices`),
            _.el('nav', 'class="main-nav"', [
                _.el('ul', '', navItems)  // Dynamically rendered navigation items
            ])
        ]);
    }
};

_.if()
// components/header.js
module.exports = {
    render: (context) => {
        const user = context.requestData.user;
        const isAuthenticated = context.requestData.isAuthenticated;

        // Create navigation items based on user role
        const navItems = _.if(
            isAuthenticated,
            _.el('ul', '', [
                _.el('li', '', _.el('a', 'href="/profile"', 'Profile')),
                _.el('li', '', _.el('a', 'href="/logout"', 'Logout'))
            ]),
            _.el('ul', '', [
                _.el('li', '', _.el('a', 'href="/login"', 'Login')),
                _.el('li', '', _.el('a', 'href="/register"', 'Register'))
            ])
        );

        // Render header with dynamic navItems
        return _.el('header', 'class="site-header"', [
            _.el('h1', '', `Welcome to JL WebServices`),
            _.el('nav', 'class="main-nav"', [navItems])  // Dynamically rendered navigation items
        ]);
    }
};

_.where()
// components/userList.js
module.exports = {
    render: (context) => {
        const users = [
            { name: 'Alice', age: 30, status: 'active' },
            { name: 'Bob', age: 22, status: 'inactive' },
            { name: 'Charlie', age: 28, status: 'active' },
            { name: 'David', age: 35, status: 'inactive' }
        ];

        // Filter active users
        const activeUsers = _.where(users, { status: 'active' });

        // Render the active users list
        return _.el('section', 'class="user-list"', [
            _.el('h2', '', 'Active Users'),
            _.el('ul', '', activeUsers.map(user =>
                _.el('li', '', `${user.name} - Age: ${user.age}`)
            ))
        ]);
    }
};

module.exports = {
    render: (context) => {
        const teamMembers = [
            "Alice Johnson - CEO",
            "Bob Smith - Lead Developer",
            "Charlie Brown - UI/UX Designer",
            "Dana White - Marketing Manager",
            "Elliot Harper - Sales Director"
        ];

        return _.el('section', 'class="team-section"', [
            _.el('h3', '', 'Meet Our Team'),
            _.el('ul', 'class="team-list"', _.for(teamMembers, null, (member, index) =>
                _.el('li', '', teamMembers[index])
            ))
        ]);
    }
};


to create a template you can create a _.render() file  into 
where content _.$['component'].render(context.component) would be the expected content
the route set up where you would put the context. 
you could use a separte file of a js obj or a rendered component variable.
use context for url specific randering as well

const express = require('express');
const _ = require('./framework'); // Load your framework
const app = express();

app.use(express.static('public')); // Serve static files

const PORT = 3000;

_.register('header', require('./components/header'));
_.register('footer', require('./components/footer'));

app.get('/', (req, res) => {
    const context = {
        title: 'Home Page',
        user: { name: 'John Doe', role: 'admin', isAuthenticated: true },
        content: 'Welcome to the Home Page!'
    };

    const html = _.render(context);
    res.send(html);
});

_.render = (context) => {
    return _.el('html', 'lang="en"', [
        _.el('head', '', [
            _.el('title', '', context.title),
            _.el('link', `rel="stylesheet" href="${content.css}"`)
        ]),
        _.el('body', '', [
            _.$['header'] ? _.$['header'].render(context) : '',
            _.el('main', 'id="main-content"', context.content),
            _.$['footer'] ? _.$['footer'].render(context) : ''
        ])
    ]);
};

// Auto-load all components Example
_.autoloadComponents();

// Define a route
app.get('/', (req, res) => {
    const context = {
        title: 'Home Page',
        user: { name: 'John Doe', role: 'admin', isAuthenticated: true },
        content: [
            _.$['homeSkills'].render(),
            _.$['homePrices'].render()
        ].join('')
    };

    res.send(_.render(context));
});
*/

// Lets see if i can make it work

// Export the framework
module.exports = _;
