import express from 'express';
import cors from 'cors';
import Imap from 'imap';
import dotenv from 'dotenv';
import simpleLogger from 'simple-node-logger';
import jsforce from 'jsforce';
import { inspect } from 'util';
import { testD4DriversBooking } from './d4BookingService.js';

dotenv.config();
const app = express();
const log = simpleLogger.createSimpleLogger();

app.use(cors());
app.use(express.json());

// Gmail IMAP configuration
const imapConfig = {
    user: process.env.EMAIL_ADDRESS,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_SERVER,
    port: process.env.IMAP_PORT,
    tls: true,
    tlsOptions: {
        rejectUnauthorized: false
    }
};

// Salesforce configuration
const sfConfig = {
    username: 'dre192@hotmail.co.uk',
    // Combine password with security token
    password: 'Dreman.com14Dreman.com14' + 'OfFvDUiEjxaW4m5vBsgQTYjMM',  // password + security token
    loginUrl: 'https://login.salesforce.com'
};

async function getSalesforceClient() {
    try {
        const conn = new jsforce.Connection({
            loginUrl: sfConfig.loginUrl,
            version: '58.0' // Adding specific API version
        });

        console.log('Attempting to connect to Salesforce...');
        await conn.login(sfConfig.username, sfConfig.password);
        console.log('Successfully connected to Salesforce');
        return conn;
    } catch (error) {
        console.error('Salesforce connection error:', error);
        throw error;
    }
}

async function getClientDetails(conn, contactId) {
    try {
        console.log('Fetching contact details for ID:', contactId);
        const metadata = await conn.sobject('Contact').describe(); // Fetch metadata
        const allFields = metadata.fields.map(field => field.name);
        // console.log(".....", allFields)
        // Query more fields from the Contact object
        const contact = await conn.sobject('Contact')
            .select(allFields)
            .where({ Id: contactId })
            .execute();
        if (contact && contact.length > 0) {
            const contactData = contact[0];
            // console.log('Contact details:', inspect(contactData, { depth: null }));
            return {
                email: contactData.Email,
                dateOfBirth: contactData.Date_of_Birth__c,
                phone: contactData.Phone,
                firstName: contactData.FirstName,
                lastName: contactData.LastName,
                mailingAddress: {
                    street: contactData.MailingStreet,
                    city: contactData.MailingCity,
                    state: contactData.MailingState,
                    postalCode: contactData.MailingPostalCode,
                    country: contactData.MailingCountry
                }
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching Salesforce contact:', error);
        return null;
    }
}

function decodeQuotedPrintable(text) {
    return text
        .replace(/=\r?\n/g, '')  // Remove soft line breaks (`=` at the end of a line)
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))); // Decode hex chars
}

function extractSalesforceUrl(body) {
    // Decode the quoted-printable encoding
    const decodedBody = decodeQuotedPrintable(body);
    console.log("Decoded Body:", decodedBody);

    // Match the full Salesforce Contact URL
    const match = decodedBody.match(/(https:\/\/[a-zA-Z0-9.-]+\.force\.com\/lightning\/r\/Contact\/003[A-Za-z0-9]+\/view)/);
    if (match) {
        console.log("Extracted URL:", match[1]);
        return match[1]; // Return the full URL
    }

    console.log("No Salesforce Contact URL found.");
    return null;
}

app.get('/api/check-bookings', async (req, res) => {
    const imap = new Imap(imapConfig);

    function findBookingEmails() {
        return new Promise((resolve, reject) => {
            imap.once('ready', () => {
                imap.openBox('INBOX', false, (err, box) => {
                    if (err) reject(err);

                    const today = new Date();
                    const todayString = '2025-03-18'; // For testing with your example
                    // console.log('Searching emails since:', todayString);

                    const searchCriteria = [
                        ['SINCE', todayString]
                    ];

                    imap.search(searchCriteria, (err, results) => {
                        if (err) reject(err);

                        const bookingEmails = [];

                        if (results.length === 0) {
                            imap.end();
                            resolve([]);
                            return;
                        }

                        const fetch = imap.fetch(results, {
                            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT', 'HEADER'],
                            struct: true
                        });

                        fetch.on('message', (msg) => {
                            const emailData = {
                                headers: null,
                                body: '',
                                fullBody: '',
                                parsedData: {
                                    firstName: '',
                                    lastName: '',
                                    salesforceUrl: '',
                                    postalCode: '',
                                    bookingDetails: '',
                                    bookingTime: '',
                                    bookingDate: '',
                                    clientName: '',
                                    salesforceDetails: null
                                }
                            };

                            msg.on('body', (stream, info) => {
                                let buffer = '';
                                stream.on('data', (chunk) => {
                                    buffer += chunk.toString('utf8');
                                });
                                stream.once('end', () => {
                                    if (info.which === 'TEXT') {
                                        emailData.body = buffer;
                                        emailData.fullBody = buffer;
                                        // console.log('Email body:', buffer.substring(0, 200) + '...');
                                    } else if (info.which.startsWith('HEADER')) {
                                        emailData.headers = Imap.parseHeader(buffer);
                                    }
                                });
                            });
                            // console.log('----> Body',emailData.body )
                            msg.once('end', () => {
                                const bookingKeywords = ['book', 'booking', 'appointment', 'reservation'];
                                const hasBookingContent = bookingKeywords.some(keyword =>
                                    emailData.body.toLowerCase().includes(keyword.toLowerCase()) ||
                                    (emailData.headers.subject && emailData.headers.subject[0].toLowerCase().includes(keyword.toLowerCase()))
                                );

                                if (hasBookingContent) {
                                    // Extract Client Name
                                    const clientNameMatch = emailData.body.match(/Andre\.Anthony/i) || emailData.body.match(/Andre\s+Anthony/i);
                                    if (clientNameMatch) {
                                        emailData.parsedData.firstName = 'Andre';
                                        emailData.parsedData.lastName = 'Anthony';
                                        emailData.parsedData.clientName = 'Andre Anthony';
                                    }

                                    // Extract Salesforce URL
                                    console.log("emailData.fullBody", emailData.fullBody)
                                    const salesforceUrl = extractSalesforceUrl(emailData.fullBody);
                                    if (salesforceUrl) {
                                        emailData.parsedData.salesforceUrl = salesforceUrl;
                                        const contactIdMatch = salesforceUrl.match(/Contact\/([^/]+)/);
                                        if (contactIdMatch) {
                                            emailData.parsedData.salesforceContactId = contactIdMatch[1];
                                        }
                                    }

                                    // Extract postal code
                                    const postalCodeMatch = emailData.body.match(/IG1\s*4NH/i);
                                    if (postalCodeMatch) {
                                        emailData.parsedData.postalCode = postalCodeMatch[0].toUpperCase();
                                    }

                                    // Extract booking details
                                    const bookingDetailsMatch = emailData.body.match(/D4\s+Medical31\s+May\s+2025\s+08:00/);
                                    if (bookingDetailsMatch) {
                                        const bookingDetails = bookingDetailsMatch[0];

                                        // Regex to extract date (e.g., "31 May 2025") and time (e.g., "08:00")
                                        const regex = /(\d{1,2} [A-Za-z]+ \d{4}) (\d{2}:\d{2})/;
                                        const match = bookingDetails.match(regex);

                                        if (match) {
                                            emailData.parsedData.bookingDetails = bookingDetails;
                                            emailData.parsedData.bookingDate = match[1]; // "31 May 2025"
                                            emailData.parsedData.bookingTime = match[2]; // "08:00"
                                        }

                                    }

                                    console.log('Parsed email data:', inspect(emailData.parsedData, { depth: null }));
                                    bookingEmails.push({
                                        headers: emailData.headers,
                                        parsedData: emailData.parsedData
                                    });
                                }
                            });
                        });

                        fetch.once('error', (err) => {
                            console.error('Fetch error:', err);
                            reject(err);
                        });

                        fetch.once('end', () => {
                            imap.end();
                            resolve(bookingEmails);
                        });
                    });
                });
            });

            imap.once('error', (err) => {
                console.error('IMAP error:', err);
                reject(err);
            });

            imap.connect();
        });
    }

    try {
        console.log('Starting email search...');
        const emails = await findBookingEmails();
        console.log(`Found ${emails.length} booking emails`);

        // Connect to Salesforce and fetch additional details
        if (emails.length > 0) {
            try {
                const conn = await getSalesforceClient();
                console.log('Connected to Salesforce, fetching details...');
                
                // Fetch Salesforce details for each booking
                for (let email of emails) {
                    if (email.parsedData.salesforceContactId) {
                        email.parsedData.salesforceDetails = await getClientDetails(conn, email.parsedData.salesforceContactId);
                        
                        // After getting Salesforce details, attempt to book D4 appointment
                        try {
                            // Parse and format the booking date from email
                            const [day, month, year] = email.parsedData.bookingDate.split(' ');
                            const monthNumber = new Date(`${month} 1, 2000`).getMonth() + 1;
                            const formattedDate = `${year}-${monthNumber.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

                            const bookingData = {
                                bookingDate: formattedDate, // Now in YYYY-MM-DD format
                                bookingTime: email.parsedData.bookingTime,
                                firstName: email.parsedData.firstName,
                                lastName: email.parsedData.lastName,
                                email: email.parsedData.salesforceDetails?.email || 'info@hgvlearning.com',
                                phone: email.parsedData.salesforceDetails?.phone || '',
                                postalCode: email.parsedData.postalCode,
                                dateOfBirth: email.parsedData.salesforceDetails?.dateOfBirth
                            };

                            // console.log('Attempting to book D4 appointment with data:', bookingData);
                            const bookingResult = await testD4DriversBooking(bookingData);
                            email.parsedData.bookingAttempted = true;
                            email.parsedData.bookingSuccess = bookingResult.success;
                            email.parsedData.bookingError = bookingResult.error;

                            // After successful booking, mark the email as read
                            if (bookingResult.success) {
                                console.log('Marking email as read...');
                                await new Promise((resolve, reject) => {
                                    imap.setFlags(email.headers.inbox.seq, '\\Seen', (err) => {
                                        if (err) {
                                            console.error('Error marking email as read:', err);
                                            reject(err);
                                        } else {
                                            console.log('Email marked as read successfully');
                                            resolve();
                                        }
                                    });
                                });
                            }
                        } catch (bookingError) {
                            console.error('Failed to book D4 appointment:', bookingError);
                            email.parsedData.bookingAttempted = true;
                            email.parsedData.bookingSuccess = false;
                            email.parsedData.bookingError = bookingError.message;
                        }
                    }
                }
            } catch (sfError) {
                console.error('Salesforce error:', sfError);
                // Continue without Salesforce details if there's an error
            }
        }
        
        res.json({ success: true, emails });
    } catch (error) {
        console.error('Server error:', error);
        log.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 