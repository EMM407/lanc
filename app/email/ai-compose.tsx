import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { generateWithGroq, emailPrompts } from '@/lib/groq';
import { sendEmail } from '@/lib/email';
import { Client } from '@/types/database';
import { 
  ArrowLeft, 
  Send, 
  Save, 
  X, 
  Mail, 
  ChevronDown,
  Sparkles,
  Paperclip,
} from 'lucide-react-native';

export default function AIEmailComposerScreen() {
  const { to, clientName, employeeName } = useLocalSearchParams<{ 
    to?: string; 
    clientName?: string; 
    employeeName?: string; 
  }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    to: to || '',
    subject: '',
    body: '',
    purpose: '',
    context: '',
  });
  
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);

  const emailPurposes = [
    'Project Update',
    'Invoice Follow-up',
    'Meeting Request',
    'Proposal Submission',
    'Contract Discussion',
    'Thank You Note',
    'Status Report',
    'Feedback Request',
    'Service Inquiry',
    'General Communication',
  ];

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleAIGenerate = async () => {
    if (!formData.purpose) {
      Alert.alert('Error', 'Please select an email purpose first');
      return;
    }

    setAiGenerating(true);
    
    try {
      const recipientName = clientName || employeeName || formData.to.split('@')[0];
      const context = formData.context || `Professional communication regarding ${formData.purpose.toLowerCase()}`;
      
      const messages = emailPrompts.generateEmail(
        formData.purpose,
        recipientName,
        context
      );
      
      const aiResponse = await generateWithGroq(messages);
      
      // Parse AI response
      const lines = aiResponse.split('\n');
      let subject = '';
      let body = '';
      let currentSection = '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().includes('subject:')) {
          subject = trimmedLine.replace(/subject:/i, '').trim();
          continue;
        } else if (trimmedLine.toLowerCase().includes('body:') || trimmedLine.toLowerCase().includes('email:')) {
          currentSection = 'body';
          continue;
        }
        
        if (currentSection === 'body' && trimmedLine) {
          body += trimmedLine + '\n';
        } else if (!subject && !currentSection && trimmedLine) {
          subject = trimmedLine;
          currentSection = 'body';
        }
      }
      
      setFormData(prev => ({
        ...prev,
        subject: subject || `${formData.purpose} - ${recipientName}`,
        body: body.trim() || aiResponse,
      }));
      
      Alert.alert('Success', 'AI has generated a professional email!');
    } catch (error) {
      console.error('Error generating with AI:', error);
      Alert.alert('Error', 'Failed to generate email with AI. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!formData.to || !formData.subject || !formData.body) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.to)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    
    try {
      // Prepare sender information for EmailJS
      const senderEmail = user?.email || 'noreply@businessmanager.com';
      const senderName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Business Manager';
      const fromAddress = `${senderName} <${senderEmail}>`;
      
      // Send the email via EmailJS
      const emailResult = await sendEmail({
        to: formData.to,
        subject: formData.subject,
        body: formData.body,
        from: fromAddress,
      });

      if (!emailResult.success) {
        const errorMessage = emailResult.error || 'Failed to send email';
        console.error('Email send error:', emailResult.details);
        throw new Error(errorMessage);
      }

      // Log the email activity
      await supabase
        .from('activities')
        .insert([{
          type: 'email_sent',
          title: `Email sent: ${formData.subject}`,
          description: `To: ${formData.to}${emailResult.messageId ? `\nMessage ID: ${emailResult.messageId}` : ''}`,
          entity_type: 'email',
          entity_id: emailResult.messageId,
          user_id: user?.id,
        }]);

      // Show success message
      const successMessage = `Your email has been sent successfully to ${formData.to}`;
      const detailMessage = emailResult.messageId 
        ? `\n\nMessage ID: ${emailResult.messageId}\n\nThe recipient should receive your email shortly.`
        : '\n\nThe recipient should receive your email shortly.';
      
      Alert.alert('Email Sent! ✅', successMessage + detailMessage);
      router.back();
    } catch (error) {
      console.error('Error sending email:', error);
      
      let errorMessage = 'Failed to send email. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Invalid') || error.message.includes('configuration')) {
          errorMessage = 'Email service configuration error. Please check your EmailJS settings.';
        } else if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
          errorMessage = 'Too many emails sent. Please wait a moment and try again.';
        } else if (error.message.includes('Network error')) {
          errorMessage = 'Network connection error. Please check your internet connection and try again.';
        } else {
          errorMessage = `Send failed: ${error.message}`;
        }
      }
      
      Alert.alert('Send Failed ❌', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await supabase
        .from('activities')
        .insert([{
          type: 'email_draft_saved',
          title: `Email draft saved: ${formData.subject || 'Untitled'}`,
          description: `To: ${formData.to}`,
          entity_type: 'email_draft',
          user_id: user?.id,
        }]);

      Alert.alert('Success', 'Draft saved successfully!');
    } catch (error) {
      console.error('Error saving draft:', error);
      Alert.alert('Error', 'Failed to save draft.');
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 20,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      marginRight: 16,
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    headerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    headerButtonSecondary: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerButtonText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: 'white',
      marginLeft: 6,
    },
    headerButtonTextSecondary: {
      color: colors.textSecondary,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      padding: 24,
    },
    aiSection: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    aiHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    aiIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    aiTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    aiDescription: {
      fontSize: 14,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    aiButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    aiButtonDisabled: {
      opacity: 0.6,
    },
    aiButtonText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: 'white',
      marginLeft: 8,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 16,
      zIndex: 1,
    },
    dropdownInputGroup: {
      marginBottom: 16,
      zIndex: 1000,
    },
    purposeDropdownGroup: {
      marginBottom: 16,
      zIndex: 2000,
    },
    label: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      color: colors.text,
      marginBottom: 8,
    },
    required: {
      color: colors.error,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: 'Inter-Regular',
      color: colors.text,
    },
    dropdownContainer: {
      position: 'relative',
      zIndex: 1000,
    },
    dropdownButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    dropdownText: {
      fontSize: 16,
      fontFamily: 'Inter-Regular',
      color: colors.text,
    },
    dropdownPlaceholder: {
      color: colors.textMuted,
    },
    dropdownList: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      marginTop: 4,
      maxHeight: 200,
      zIndex: 2000,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    dropdownItem: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    dropdownItemText: {
      fontSize: 16,
      fontFamily: 'Inter-Regular',
      color: colors.text,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    largeTextArea: {
      minHeight: 200,
      textAlignVertical: 'top',
    },
    attachmentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      marginTop: 16,
    },
    attachmentText: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginLeft: 8,
    },
    actionButtons: {
      flexDirection: 'row',
      paddingHorizontal: 24,
      paddingVertical: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    primaryActionButton: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    secondaryActionButton: {
      backgroundColor: colors.background,
      borderColor: colors.border,
    },
    actionButtonText: {
      fontSize: 14,
      fontFamily: 'Inter-SemiBold',
      marginLeft: 8,
    },
    primaryActionButtonText: {
      color: 'white',
    },
    secondaryActionButtonText: {
      color: colors.primary,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Email Composer</Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerButton, styles.headerButtonSecondary]}
            onPress={() => router.back()}
          >
            <X size={16} color={colors.textSecondary} />
            <Text style={[styles.headerButtonText, styles.headerButtonTextSecondary]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* AI Generation Section */}
        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Sparkles size={20} color="white" />
            </View>
            <Text style={styles.aiTitle}>AI-Powered Email Composition</Text>
          </View>
          <Text style={styles.aiDescription}>
            Generate professional, engaging emails with AI. Specify the purpose and context to get perfectly crafted content.
          </Text>
          <TouchableOpacity
            style={[styles.aiButton, (aiGenerating || !formData.purpose) && styles.aiButtonDisabled]}
            onPress={handleAIGenerate}
            disabled={aiGenerating || !formData.purpose}
          >
            {aiGenerating ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Sparkles size={16} color="white" />
            )}
            <Text style={styles.aiButtonText}>
              {aiGenerating ? 'Generating...' : 'Generate Email'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email Setup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Setup</Text>
          
          <View style={[styles.purposeDropdownGroup, styles.dropdownContainer]}>
            <Text style={styles.label}>
              Email Purpose <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => {
                setShowPurposeDropdown(!showPurposeDropdown);
                setShowClientDropdown(false);
              }}
            >
              <Text style={[
                styles.dropdownText,
                !formData.purpose && styles.dropdownPlaceholder
              ]}>
                {formData.purpose || 'Select email purpose'}
              </Text>
              <ChevronDown size={20} color={colors.textMuted} />
            </TouchableOpacity>
            
            {showPurposeDropdown && (
              <View style={styles.dropdownList}>
                <ScrollView style={{ maxHeight: 200 }}>
                  {emailPurposes.map((purpose) => (
                    <TouchableOpacity
                      key={purpose}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setFormData(prev => ({ ...prev, purpose }));
                        setShowPurposeDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{purpose}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Context/Additional Information</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.context}
              onChangeText={(text) => setFormData(prev => ({ ...prev, context: text }))}
              placeholder="Provide context to help AI generate better content"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Email Composition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Composition</Text>
          
          <View style={[styles.dropdownInputGroup, styles.dropdownContainer]}>
            <Text style={styles.label}>
              To <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => {
                setShowClientDropdown(!showClientDropdown);
                setShowPurposeDropdown(false);
              }}
            >
              <Text style={[
                styles.dropdownText,
                !formData.to && styles.dropdownPlaceholder
              ]}>
                {formData.to || 'Select recipient or enter email'}
              </Text>
              <ChevronDown size={20} color={colors.textMuted} />
            </TouchableOpacity>
            
            {showClientDropdown && (
              <View style={styles.dropdownList}>
                <ScrollView style={{ maxHeight: 200 }}>
                  {clients.map((client) => (
                    <TouchableOpacity
                      key={client.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setFormData(prev => ({ ...prev, to: client.email || '' }));
                        setShowClientDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>
                        {client.name} {client.email && `(${client.email})`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={formData.to}
              onChangeText={(text) => setFormData(prev => ({ ...prev, to: text }))}
              placeholder="Or enter email address manually"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Subject <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={formData.subject}
              onChangeText={(text) => setFormData(prev => ({ ...prev, subject: text }))}
              placeholder="Enter email subject"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Message <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.largeTextArea]}
              value={formData.body}
              onChangeText={(text) => setFormData(prev => ({ ...prev, body: text }))}
              placeholder="Enter your message"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={8}
            />
          </View>

          <TouchableOpacity style={styles.attachmentButton}>
            <Paperclip size={16} color={colors.textSecondary} />
            <Text style={styles.attachmentText}>Add Attachment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.secondaryActionButton]}
          onPress={handleSaveDraft}
        >
          <Save size={16} color={colors.primary} />
          <Text style={[styles.actionButtonText, styles.secondaryActionButtonText]}>
            Save Draft
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.primaryActionButton]}
          onPress={handleSend}
          disabled={loading}
        >
          <Send size={16} color="white" />
          <Text style={[styles.actionButtonText, styles.primaryActionButtonText]}>
            {loading ? 'Sending...' : 'Send Email'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}